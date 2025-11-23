import { Context, h, Schema } from 'koishi'
import { } from 'koishi-plugin-puppeteer'

import { promises as fs, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const name = 'manosaba-memes'
export const inject = {
  //  optional: [''],
  required: ['logger', 'puppeteer']
}

const readme = readFileSync(resolve(__dirname, '../readme.md'), 'utf-8')

export const usage = `
---

<details>
<summary>点击查看插件简介和使用说明</summary>
<br/>
${readme}
</details>

---
`

export interface Config {
  debug: boolean
}

export const Config: Schema<Config> = Schema.object({
  debug: Schema.boolean().default(false).description('调试模式：开启后，在渲染失败时不会自动关闭 Puppeteer 页面，便于检查。')
})


export function apply(ctx: Context, config: Config) {
  ctx.on('ready', async () => {
    const logger = ctx.logger('manosaba-memes');
    const assetPath = resolve(__dirname, '../assets');
    ctx
      .command("manosaba.安安说 [text:text]")
      .example("manosaba.安安说 吾辈命令你现在【猛击自己的魔丸一百下】")
      .example("manosaba.安安说 -f 害羞 吾辈命令你现在【猛击自己的魔丸一百下】")
      .example("manosaba.安安说 吾辈命令你现在【猛击自己的魔丸一百下】[开心]")
      .option('face', '-f <face:string>', { fallback: 'base' })
      .action(async ({ session, options }, text) => {
        if (!text) return '请输入要说的话。';

        // 提取表情
        const faceMatch = text.match(/\[(.+?)\]$/);
        let face = options.face;
        if (faceMatch) {
          face = faceMatch[1];
          text = text.substring(0, text.lastIndexOf('['));
        }

        // 添加“默认”作为“base”的别名
        if (face === '默认') {
          face = 'base';
        }

        const validFaces = ['base', '害羞', '生气', '病娇', '无语', '开心'];
        const displayFaces = ['默认', 'base', '害羞', '生气', '病娇', '无语', '开心'];
        if (!validFaces.includes(face)) {
          return `无效的表情: ${face}。可用表情: ${displayFaces.join(', ')}`;
        }

        let page;
        try {
          // 实时加载HTML模板和所需资源
          const ananTemplate = await fs.readFile(resolve(assetPath, 'html/anan-meme-generator.html'), 'utf-8');
          const fontData = await loadAssetAsBase64(resolve(assetPath, 'fonts/SourceHanSansSC-Bold.otf'));
          const overlayData = await loadAssetAsBase64(resolve(assetPath, 'anan/base_overlay.png'));

          let htmlContent = ananTemplate
            .replace('{{FONT_DATA_URL}}', fontData)
            .replace('{{OVERLAY_DATA_URL}}', overlayData)
            .replace('{{RENDER_TEXT}}', h.escape(text))
            .replace('{{SELECTED_FACE}}', face);

          for (const f of validFaces) {
            const faceData = await loadAssetAsBase64(resolve(assetPath, `anan/${f}.png`));
            // 占位符大小写不匹配
            const placeholderKey = f === 'base' ? 'BASE' : f;
            htmlContent = htmlContent.replace(`{{FACE_${placeholderKey}_DATA_URL}}`, faceData);
          }

          page = await ctx.puppeteer.page();
          await page.setContent(htmlContent, { waitUntil: 'load' });
          const canvas = await page.$('#preview-canvas');
          const imageBuffer = await canvas.screenshot({ type: 'png' });
          return h.image(imageBuffer, 'image/png');
        } catch (error) {
          logger.error('渲染安安表情包失败:', error);
          if (config.debug) {
            session.send('渲染失败，调试模式已开启，页面未关闭。');
          }
          return '生成图片时遇到问题。';
        } finally {
          if (page && !config.debug) {
            await page.close();
          }
        }
      });

    ctx
      .command("manosaba.审判 <options:text>")
      .example("manosaba.审判 赞同：一定是汉娜干的")
      .example("manosaba.审判 --role hiro 伪证：我和艾玛不是恋人；赞同：我们初中的时候就确认关系了")
      .example("manosaba.审判 -r 艾玛 疑问：汉娜和雪莉约会没有邀请我很可疑")
      .option('role', '-r <role:string>', { fallback: 'ema' })
      .action(async ({ session, options }, text) => {
        // 处理角色别名
        let role = options.role.toLowerCase();
        if (role === '艾玛') role = 'ema';
        if (role === '希罗') role = 'hiro';

        // 角色校验
        if (!['ema', 'hiro'].includes(role)) {
          return '请输入有效的角色 (ema, 艾玛, hiro, 希罗)。';
        }
        // 检查是否输入了选项文本
        if (!text) {
          return '请输入选项内容，使用分号分隔，例如: "赞同:你好;疑问:再见"';
        }

        const statementMap = { '赞同': 'agreement', '疑问': 'doubt', '伪证': 'perjury', '反驳': 'refutation' };

        // 解析选项，源于指令的主要参数 text，同时支持全角/半角分号和冒号
        const parsedOptions = text.split(/[;；]/).map(opt => {
          const parts = opt.split(/[:：]/);
          if (parts.length < 2) return null;
          const statementKey = parts[0];
          const text = parts.slice(1).join(':'); // 允许文本中包含冒号
          const statement = statementMap[statementKey];
          if (!statement || !text) return null;
          return { statement, text: text.trim() };
        }).filter(Boolean);

        if (parsedOptions.length === 0) {
          return '无效的选项格式。示例: "赞同:你好;疑问:再见"';
        }

        let page;
        try {
          // 实时加载HTML模板和所需资源
          const trialTemplate = await fs.readFile(resolve(assetPath, 'html/trial-meme-generator.html'), 'utf-8');
          const fontData = await loadAssetAsBase64(resolve(assetPath, 'fonts/SourceHanSerifSC.otf'));

          let htmlContent = trialTemplate
            .replace('{{FONT_DATA_URL}}', fontData)
            .replace('{{BACKGROUND_DATA_URL}}', await loadAssetAsBase64(resolve(assetPath, 'trial/background.png')))
            .replace('{{BLACK_DATA_URL}}', await loadAssetAsBase64(resolve(assetPath, 'trial/black.png')))
            .replace('{{OPTION_DATA_URL}}', await loadAssetAsBase64(resolve(assetPath, 'trial/option.png')))
            .replace('{{CHARACTER_EMA_DATA_URL}}', await loadAssetAsBase64(resolve(assetPath, 'trial/ema.png')))
            .replace('{{CHARACTER_HIRO_DATA_URL}}', await loadAssetAsBase64(resolve(assetPath, 'trial/hiro.png')))
            .replace('{{SELECTED_CHARACTER}}', role) // 使用处理别名后的 role
            .replace('{{OPTIONS_JSON}}', JSON.stringify(parsedOptions));

          for (const statement of Object.values(statementMap)) {
            const statementData = await loadAssetAsBase64(resolve(assetPath, `trial/${statement}.png`));
            htmlContent = htmlContent.replace(`{{STATEMENT_${statement.toUpperCase()}_DATA_URL}}`, statementData);
          }

          page = await ctx.puppeteer.page();
          await page.setContent(htmlContent, { waitUntil: 'load' });
          const canvas = await page.$('#preview-canvas');
          const imageBuffer = await canvas.screenshot({ type: 'png' });
          return h.image(imageBuffer, 'image/png');
        } catch (error) {
          logger.error('渲染审判表情包失败:', error);
          if (config.debug) {
            session.send('渲染失败，调试模式已开启，页面未关闭。');
          }
          return '生成图片时遇到问题。';
        } finally {
          if (page && !config.debug) {
            await page.close();
          }
        }
      });

    // 将文件转换为Base64 Data URL
    async function loadAssetAsBase64(filePath: string): Promise<string> {
      try {
        const buffer = await fs.readFile(filePath);
        const extension = filePath.split('.').pop().toLowerCase();
        let mimeType = '';
        if (extension === 'png') mimeType = 'image/png';
        else if (['otf', 'ttf'].includes(extension)) mimeType = 'font/opentype';
        if (!mimeType) throw new Error(`Unsupported file type: ${extension}`);
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
      } catch (error) {
        // 当资源加载失败时，记录错误并重新抛出异常，以便上层捕获
        logger.error(`加载资源失败: ${filePath}`, error);
        throw error;
      }
    }
  });

}
