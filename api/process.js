// 文件名：api/process.js
// 功能：接收图片，调用阿里云通义千问API识别内容，返回结构化数据

export default async function handler(req, res) {
  // 设置跨域访问，让iPhone快捷指令可以调用
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 只允许POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持POST请求' });
  }

  try {
    console.log('开始处理图片...');
    const { image } = req.body;

    // 检查是否有图片数据
    if (!image) {
      console.error('没有收到图片数据');
      return res.status(400).json({ error: '没有收到图片数据' });
    }

    // 获取环境变量中的API密钥
    const apiKey = process.env.ALIYUN_API_KEY;
    if (!apiKey) {
      console.error('API密钥未配置');
      return res.status(500).json({ error: '服务器配置错误' });
    }

    console.log('准备调用阿里云API...');

    // 调用阿里云通义千问视觉模型
    // 注意：这里的URL和参数需要根据阿里云最新文档调整
    const dashscopeResponse = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable'
      },
      body: JSON.stringify({
        "model": "qwen-vl-plus",
        "input": {
          "messages": [
            {
              "role": "user",
              "content": [
                {
                  "image": image
                },
                {
                  "text": "请从这张图片中精确提取以下信息，并以JSON格式返回：\n1. title: 活动标题\n2. content: 主要内容\n3. location: 活动地点\n4. time: 活动时间（如果是日期时间请转换为标准格式）\n5. requirements: 活动要求\n\n如果某项信息不存在，请设置为空字符串。确保返回纯JSON格式，不要有其他文字。示例：{\"title\": \"会议\", \"content\": \"项目讨论\", \"location\": \"会议室A\", \"time\": \"2024-01-20 14:00\", \"requirements\": \"携带资料\"}"
                }
              ]
            }
          ]
        },
        "parameters": {
          "result_format": "message"
        }
      })
    });

    if (!dashscopeResponse.ok) {
      const errorText = await dashscopeResponse.text();
      console.error('阿里云API请求失败:', dashscopeResponse.status, errorText);
      throw new Error(`阿里云API请求失败: ${dashscopeResponse.status}`);
    }

    const resultData = await dashscopeResponse.json();
    console.log('阿里云API响应:', JSON.stringify(resultData));

    // 解析阿里云的返回结果
    // 注意：这里的解析逻辑需要根据实际返回结构调整
    let extractedText = '';
    
    if (resultData.output && 
        resultData.output.choices && 
        resultData.output.choices[0] && 
        resultData.output.choices[0].message && 
        resultData.output.choices[0].message.content) {
      
      const content = resultData.output.choices[0].message.content;
      
      // 查找文本内容
      for (const item of content) {
        if (item.text) {
          extractedText = item.text;
          break;
        }
      }
    }

    if (!extractedText) {
      console.error('无法从API响应中提取文本');
      throw new Error('AI处理失败：无法提取信息');
    }

    console.log('提取的文本:', extractedText);

    // 从文本中提取JSON数据
    const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('无法找到JSON数据:', extractedText);
      throw new Error('AI返回格式错误');
    }

    const jsonString = jsonMatch[0];
    let parsedData;
    
    try {
      parsedData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('JSON解析错误:', parseError, '原始文本:', jsonString);
      throw new Error('AI返回数据格式错误');
    }

    // 返回标准化结果给iPhone快捷指令
    const responseData = {
      success: true,
      data: {
        title: parsedData.title || '',
        content: parsedData.content || '',
        location: parsedData.location || '',
        time: parsedData.time || '',
        requirements: parsedData.requirements || ''
      }
    };

    console.log('最终返回数据:', responseData);
    res.status(200).json(responseData);

  } catch (error) {
    console.error('处理过程中出错:', error);
    res.status(500).json({ 
      success: false, 
      error: '处理失败: ' + error.message 
    });
  }
}