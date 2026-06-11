const http = require('http');

const postData = JSON.stringify({
  username: 'admin',
  password: 'admin123'
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log(`状态码: ${res.statusCode}`);
  
  let data = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(`响应体: ${data}`);
    try {
      const json = JSON.parse(data);
      if (json.token) {
        console.log('\n✅ 登录成功！');
        console.log(`用户: ${json.user.name} (${json.user.role})`);
      } else {
        console.log('\n❌ 登录失败');
      }
    } catch (e) {
      console.log('\n❌ 响应解析失败');
    }
  });
});

req.on('error', (e) => {
  console.error(`请求错误: ${e.message}`);
});

req.write(postData);
req.end();
