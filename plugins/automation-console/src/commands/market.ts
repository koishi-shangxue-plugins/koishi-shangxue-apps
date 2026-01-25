import { Context } from "koishi";
import { Config, PageInstance } from "../types";
import { ensureUIControl, closeUIIfEnabled } from "../utils";

/**
 * 注册插件市场相关命令
 */
export function registerMarketCommands(
  ctx: Context,
  config: Config,
  pageRef: { current: PageInstance },
  commandNames: {
    automation: string | null;
    searchMarketPlugins: string | null;
    refreshMarket: string | null;
    openUI: string | null;
    closeUI: string | null;
  }
) {
  const { automation, searchMarketPlugins, refreshMarket, openUI, closeUI } = commandNames;

  // 插件市场搜索插件
  if (searchMarketPlugins) {
    ctx.command(`${automation || "automation-console"}.${searchMarketPlugins} [...pluginname]`, "插件市场搜索插件", {
      authority: config.commandTable.find(item => item.command === "插件市场搜索插件")?.command_authority
    })
      .example("插件市场搜索插件  puppeteer  email:1919892171@qq.com")
      .action(async ({ session }, ...args) => {
        if (!await ensureUIControl(pageRef.current, config, session, openUI)) return;

        try {
          await pageRef.current!.click('a[href^="/market"]');

          let pluginname = args.join(' ').trim();
          if (!pluginname) {
            await session.send("请发送需要搜索的插件名称：");
            pluginname = await session.prompt(config.wait_for_prompt * 1000);
          }

          const keywords = pluginname.split(' ');

          for (const keyword of keywords) {
            await pageRef.current!.type('.search-container input', keyword);
            await pageRef.current!.click('.market-hint.text-center');
          }

          const results = await pageRef.current!.evaluate(() => {
            const elements = document.querySelectorAll('.package-list .title.truncate');
            return Array.from(elements).map(el => el.getAttribute('title'));
          });

          if (results.length === 0) {
            await session.send("没有找到匹配的插件。");
            await closeUIIfEnabled(session, config, closeUI);
            return;
          }

          let message = "找到以下匹配结果，请输入需要操作的插件序号：\n";
          results.forEach((name, index) => {
            message += `${index + 1}. ${name}\n`;
          });
          await session.send(message);

          const choiceIndex = parseInt(await session.prompt(config.wait_for_prompt * 1000), 10) - 1;
          if (isNaN(choiceIndex) || choiceIndex < 0 || choiceIndex >= results.length) {
            await session.send("无效的选择。");
            await closeUIIfEnabled(session, config, closeUI);
            return;
          }

          await pageRef.current!.evaluate((choiceIndex) => {
            const buttons = document.querySelectorAll('.package-list .el-button');
            (buttons[choiceIndex] as HTMLElement).click();
          }, choiceIndex);

          const isBatchModeChecked = await pageRef.current!.evaluate(() => {
            const checkbox = document.querySelector('.el-checkbox__label') as HTMLElement;
            return checkbox && checkbox.classList.contains('is-checked');
          });

          if (isBatchModeChecked) {
            await pageRef.current!.evaluate(() => {
              const checkbox = document.querySelector('.el-checkbox__label') as HTMLElement;
              checkbox.click();
            });
          }

          const operations = await pageRef.current!.evaluate(() => {
            const ops: string[] = [];
            const buttons = document.querySelectorAll('.right .el-button span');
            buttons.forEach(button => {
              const htmlButton = button as HTMLElement;
              if (htmlButton.innerText.includes('安装')) {
                ops.push('安装');
              }
              if (htmlButton.innerText.includes('配置')) {
                ops.push('配置');
              }
              if (htmlButton.innerText.includes('卸载')) {
                ops.push('卸载');
              }
              if (htmlButton.innerText.includes('更新')) {
                ops.push('更新');
              }
            });
            return ops;
          });

          let operationMessage = "该插件可选操作为：\n";
          operations.forEach((op, index) => {
            operationMessage += `${index + 1}. ${op}\n`;
          });
          await session.send(operationMessage);

          const operationChoice = parseInt(await session.prompt(config.wait_for_prompt * 1000), 10) - 1;
          if (isNaN(operationChoice) || operationChoice < 0 || operationChoice >= operations.length) {
            await session.send("无效的选择。");
            await closeUIIfEnabled(session, config, closeUI);
            return;
          }

          const selectedOperation = operations[operationChoice];
          if (selectedOperation === '更新') {
            await session.send("请使用小火箭更新指令哦");
          } else {
            await pageRef.current!.evaluate(async (selectedOperation) => {
              const button = Array.from(document.querySelectorAll('.right .el-button span')).find(el => (el as HTMLElement).innerText.includes(selectedOperation)) as HTMLElement;
              if (button) button.click();

              if (selectedOperation === '卸载') {
                // 等待新页面加载
                await new Promise(resolve => setTimeout(resolve, 1000));
                // 点击新页面中的"删除"按钮
                const deleteButton = Array.from(document.querySelectorAll('.el-button.el-button--danger span')).find(el => (el as HTMLElement).innerText.includes('删除')) as HTMLElement;
                if (deleteButton) deleteButton.click();
              }
            }, selectedOperation);

            await session.send(`${selectedOperation}操作已完成。`);
          }

          await closeUIIfEnabled(session, config, closeUI);

        } catch (error) {
          ctx.logger.error('插件市场搜索插件时出错:', error);
          await session.send("插件市场搜索插件时出错，请重试。");
          await closeUIIfEnabled(session, config, closeUI);
        }
      });
  }

  // 刷新插件市场
  if (refreshMarket) {
    ctx.command(`${automation || "automation-console"}.${refreshMarket}`, "刷新插件市场", {
      authority: config.commandTable.find(item => item.command === "刷新插件市场")?.command_authority
    })
      .action(async ({ session }) => {
        if (!await ensureUIControl(pageRef.current, config, session, openUI)) return;

        try {
          // 切换到 /market 页面
          await pageRef.current!.click('a[href^="/market"]');

          // 在页面上下文中执行脚本，查找并点击按钮
          await pageRef.current!.evaluate(() => {
            const buttons = document.querySelectorAll('.right .menu-item');
            if (buttons && buttons.length > 1) {
              (buttons[1] as HTMLElement).click(); // 点击第二个按钮（刷新按钮）
            } else {
              throw new Error("未找到刷新按钮");
            }
          });

          await session.send("插件市场已点击刷新按钮");
          await closeUIIfEnabled(session, config, closeUI);
        } catch (error) {
          ctx.logger.error("刷新插件市场时出错:", error);
          await session.send("刷新插件市场失败，请重试。");
          await closeUIIfEnabled(session, config, closeUI);
        }
      });
  }
}
