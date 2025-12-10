import fs from 'node:fs'
import { URL, pathToFileURL, fileURLToPath } from 'node:url'
import type { Context, Session } from 'koishi'
import type { Config, JrysData } from '../types'
import { getFontDataUrl } from './font'
import { getFormattedDate } from './jrys'

/**
 * 生成运势卡片 HTML
 */
export async function generateFortuneHTML(
  ctx: Context,
  session: Session,
  config: Config,
  dJson: JrysData,
  BackgroundURL_base64: string,
  logInfo: (...args: any[]) => void
): Promise<string> {
  // 获取字体 Data URL
  const { fontDataUrl, selectedFont } = await getFontDataUrl(ctx, config, logInfo)

  let insertHTMLuseravatar = session.event.user.avatar
  let luckyStarHTML = `
.lucky-star {
font-size: 60px;
margin-bottom: 10px;
}
`
  if (config.HTML_setting.luckyStarGradientColor) {
    luckyStarHTML = `
.lucky-star {
font-size: 60px;
margin-bottom: 10px;
background: linear-gradient(to right, 
#fcb5b5, 
#fcd6ae, 
#fde8a6,
#c3f7b1, 
#aed6fa, 
#c4aff5, 
#f1afcc);
-webkit-background-clip: text;
background-clip: text;
color: transparent;
}
`
  }
  const formattedDate = await getFormattedDate(logInfo)
  let HTMLsource = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>运势卡片</title>
<style>
${fontDataUrl ? `@font-face {
font-family: "${selectedFont}";
src: url('${fontDataUrl}') format('truetype');
}` : ''}
body, html {
height: 100%;
margin: 0;
overflow: hidden;
font-family: ${fontDataUrl ? `"${selectedFont}"` : 'Arial, sans-serif'};
}
.background {
background-image: url('${BackgroundURL_base64}');
background-size: cover;
background-position: center;
position: relative;
width: 1080px;
height: 1920px;
}
.overlay {
position: absolute;
bottom: 0;
left: 0;
width: 100%;
min-height: 1%;
background-color: ${config.HTML_setting.MaskColor};
backdrop-filter: blur(${config.HTML_setting.Maskblurs}px);
border-radius: 20px 20px 0 0;
overflow: visible;
}
.user-info {
display: flex;
align-items: center;
padding: 10px 20px;
position: relative;
}
.user-avatar {
width: 120px;
height: 120px;
border-radius: 60px;
background-image: url('${insertHTMLuseravatar}');
background-size: cover;
background-position: center;
margin-left: 20px;
position: absolute;
top: 40px;
}
.username {
margin-left: 10px;
color: ${config.HTML_setting.UserNameColor};
font-size: 50px;
padding-top: 28px;
}
.fortune-info1 {
display: flex;
color: ${config.HTML_setting.HoroscopeTextColor};
flex-direction: column;
align-items: center;
position: relative;
width: 100%;
justify-content: center; /* 居中 */
margin-top: 0px; /* 上边距 */
}
.fortune-info1 > * {
margin: 10px; /* 元素之间的间距 */
}
.fortune-info2 {
color: ${config.HTML_setting.HoroscopeDescriptionTextColor};
padding: 0 20px;
margin-top: 40px;
}
.lucky-star, .sign-text, .unsign-text {
margin-bottom: 12px;
font-size: 42px;
}
.fortune-summary {
font-size: 60px;
}
${luckyStarHTML}
.sign-text, .unsign-text {
font-size: 32px;
line-height: 1.6;
padding: 10px;
border: ${config.HTML_setting.DashedboxThickn}px dashed ${config.HTML_setting.Dashedboxcolor};
border-radius: 15px;
margin-top: 10px;
}
.today-text {
font-size: 45px;
margin-bottom: 10px;
background: linear-gradient(to right, 
#fcb5b5, 
#fcd6ae, 
#fde8a6,
#c3f7b1, 
#aed6fa, 
#c4aff5, 
#f1afcc);
-webkit-background-clip: text;
background-clip: text;
color: transparent;
}
</style>
</head>
<body>
<div class="background">
<div class="overlay">
<div class="user-info">
<div class="user-avatar"></div>
<!--span class="username">上学大人</span-->
</div>
<div class="fortune-info1">
<div class="today-text">${formattedDate}</div>
<div class="fortune-summary">${dJson.fortuneSummary}</div>
<div class="lucky-star">${dJson.luckyStar}</div>
</div>
<div class="fortune-info2">           
<div class="sign-text">${dJson.signText}</div>
<div class="unsign-text">
${dJson.unsignText}
</div>
<!-- 不要迷信哦 -->
<div style="text-align: center; font-size: 24px; margin-bottom: 15px;">
仅供娱乐 | 相信科学 | 请勿迷信
</div>
</div>
</div>
</div>
</body>
</html>
`
  logInfo(`触发用户: ${session.event.user?.id}`)
  logInfo(`使用的格式化时间: ${formattedDate}`)
  if (session.platform === 'qq') {
    logInfo(`QQ官方：bot: ${session.bot.config.id}`)
    logInfo(`QQ官方：用户头像: http://q.qlogo.cn/qqapp/${session.bot.config.id}/${session.event.user?.id}/640`)
  }
  logInfo(`蒙版颜色: ${config.HTML_setting.MaskColor}`)
  logInfo(`虚线框粗细: ${config.HTML_setting.DashedboxThickn}`)
  logInfo(`虚线框颜色: ${config.HTML_setting.Dashedboxcolor}`)

  return HTMLsource
}

/**
 * 获取图片 Buffer（用于 raw_jrys 模式）
 */
export async function getImageBuffer(ctx: Context, rawUrl: string): Promise<Buffer> {
  // 首先检查是否为 data URL
  if (rawUrl.startsWith('data:image/')) {
    const base64Data = rawUrl.split(',')[1]
    return Buffer.from(base64Data, 'base64')
  }

  // 检查是否为网络 URL
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    const response = await ctx.http.get(rawUrl, { responseType: 'arraybuffer' })
    return Buffer.from(response)
  }

  // 否则，视为本地路径（可能是 file:/// URL 或普通文件系统路径）
  let localPath: string;
  if (rawUrl.startsWith('file:///')) {
    try {
      localPath = fileURLToPath(rawUrl)
    } catch (error) {
      throw new Error(`无效的 file URL: ${rawUrl}`)
    }
  } else {
    localPath = rawUrl
  }

  if (fs.existsSync(localPath)) {
    return fs.readFileSync(localPath)
  }

  throw new Error(`不支持的背景图格式或路径不存在: ${rawUrl}`)
}