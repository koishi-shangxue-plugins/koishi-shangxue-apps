import path from "node:path"

// 默认运势概率配置
export const defaultFortuneProbability = [
  { "Fortune": "☆☆☆☆☆☆☆", "luckValue": 0, "Probability": 5 },
  { "Fortune": "★☆☆☆☆☆☆", "luckValue": 14, "Probability": 10 },
  { "Fortune": "★★☆☆☆☆☆", "luckValue": 28, "Probability": 12 },
  { "Fortune": "★★★☆☆☆☆", "luckValue": 42, "Probability": 15 },
  { "Fortune": "★★★★☆☆☆", "luckValue": 56, "Probability": 30 },
  { "Fortune": "★★★★★☆☆", "luckValue": 70, "Probability": 35 },
  { "Fortune": "★★★★★★☆", "luckValue": 84, "Probability": 45 },
  { "Fortune": "★★★★★★★", "luckValue": 98, "Probability": 25 }
]

// 插件使用说明
export const usage = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>运势卡片说明</title>
</head>
<body>
<div>
<h1>获取运势卡片 🧧</h1>
<p>发送指令 <code>jrysprpr</code> 即可获取一张个性化的运势卡片。</p>
<p>您还可以使用 <code>--split</code> 选项来获取图文模式的运势，只需发送 <code>jrysprpr -s</code> 即可。</p>
<h3>如果您想获取运势卡的背景图，需要启用<code>原图</code>指令</h3>
<h3>可以直接回复一张已发送的运势卡图片并输入指令 <code>获取原图</code>。</h3>
<p>或者使用 <code>获取原图 ********</code> 来获取对应标识码的背景图。</p>
<p>如果您使用的是QQ官方bot，也可以通过点击markdown运势卡上的"查看原图"按钮来获取。</p>
<hr>
</div>
</body>
</html>
`

// 默认背景图路径
export const getDefaultBackgroundPaths = () => [
  path.join(__dirname, './../data/backgroundFolder/miao.jpg'),
  path.join(__dirname, './../data/backgroundFolder'),
  path.join(__dirname, './../data/backgroundFolder/魔卡.txt'),
  path.join(__dirname, './../data/backgroundFolder/ba.txt'),
  path.join(__dirname, './../data/backgroundFolder/猫羽雫.txt'),
  path.join(__dirname, './../data/backgroundFolder/miku.txt'),
  path.join(__dirname, './../data/backgroundFolder/白圣女.txt'),
]