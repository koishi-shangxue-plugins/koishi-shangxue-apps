import { Context } from "koishi";
import { Config, PageInstance } from "../types";
import { handleLoginAndNavigate, createLogger } from "../utils";

/**
 * 注册插件管理相关命令
 */
export function registerPluginManagementCommands(
  ctx: Context,
  config: Config,
  commandNames: {
    automation: string | null;
    plugins: string | null;
  }
) {
  const { automation, plugins } = commandNames;
  const log = createLogger(ctx, config);

  // 配置插件
  if (plugins) {
    ctx.command(`${automation || "automation-console"}.${plugins} [pluginname] [pluginchoice] [pluginoperation]`, "搜索插件", {
      authority: config.commandTable.find(item => item.command === "配置插件")?.command_authority
    })
      .example("配置插件 commands  1  1")
      .action(async ({ session }, pluginname, pluginchoice, pluginoperation) => {
        let page: PageInstance = null;

        try {
          // 打开页面并处理登录
          page = await ctx.puppeteer.page();
          await handleLoginAndNavigate(ctx, config, page, '/plugins/');

          // 获取所有插件的名称
          const plugins = await page.evaluate(() => {
            const elements = document.querySelectorAll('.label[title]');
            return Array.from(elements).map(el => el.getAttribute('title'));
          });

          // 如果没有提供插件名称关键词，则请求用户输入
          let keyword = pluginname;
          if (!pluginname) {
            await session.send("请输入要操作的插件名：")
            keyword = await session.prompt(config.wait_for_prompt * 1000);
          }
          log(keyword);

          // 找到匹配的插件
          const matches = plugins.filter(name => name && name.includes(keyword));
          if (matches.length === 0) {
            await session.send("没有找到匹配的插件。");
            return;
          }

          // 使用配置项限制返回的插件数量
          const limitedMatches = matches.slice(0, config.maxlist);

          // 如果没有提供 pluginchoice ，才请求用户输入
          let choiceIndex = pluginchoice ? parseInt(pluginchoice, 10) - 1 : null;
          if (choiceIndex === null || isNaN(choiceIndex) || choiceIndex < 0 || choiceIndex >= limitedMatches.length) {
            let message = "找到多个匹配的插件，请选择：\n";
            limitedMatches.forEach((name, index) => {
              message += `${index + 1}. ${name}\n`;
            });
            await session.send(message);
            choiceIndex = parseInt(await session.prompt(config.wait_for_prompt * 1000), 10) - 1;
          }

          if (isNaN(choiceIndex) || choiceIndex < 0 || choiceIndex >= limitedMatches.length) {
            await session.send("无效的选择。");
            return;
          }

          const selectedPlugin = limitedMatches[choiceIndex];

          // 操作插件
          await page.evaluate((selectedPlugin, choiceIndex) => {
            const elements = Array.from(document.querySelectorAll('.label[title]'));
            const targetElement = elements.filter(el => el.getAttribute('title') === selectedPlugin)[choiceIndex] as HTMLElement;
            targetElement.click();
          }, selectedPlugin, choiceIndex);

          // 等待页面更新
          await new Promise(resolve => setTimeout(resolve, 500));

          // 检查可用按钮数量
          const buttonCount = await page.evaluate(() => {
            return document.querySelectorAll('.right .menu-item:not(.disabled)').length;
          });

          if (buttonCount < 6) {
            await session.send("可用按钮不足6个，非普通插件，请前往控制台操作！");
            return;
          }

          // 如果没有提供 pluginoperation ，才请求用户输入
          let operation = pluginoperation ? parseInt(pluginoperation, 10) : null;
          if (operation === null || isNaN(operation) || operation < 1 || operation > 5) {
            await session.send("请选择操作的按钮序号：\n0.双击【启用插件/停用插件】\n1.单击【启用插件/停用插件】\n2.【保存配置/重载配置】\n3.【重命名】\n4.【移除插件】\n5.【克隆配置】");
            operation = parseInt(await session.prompt(config.wait_for_prompt * 1000), 10);
          }

          if (isNaN(operation) || operation < 0 || operation > 5) {
            await session.send("此插件无法执行此操作。");
            return;
          }

          if (operation === 0) {
            // 双击启用/停用插件
            await page.evaluate(() => {
              const buttons = document.querySelectorAll('.right .menu-item:not(.disabled)');
              (buttons[0] as HTMLElement).click(); // 第一次点击
            });

            await new Promise(resolve => setTimeout(resolve, 1000)); // 等待一秒

            await page.evaluate(() => {
              const buttons = document.querySelectorAll('.right .menu-item:not(.disabled)');
              (buttons[0] as HTMLElement).click(); // 第二次点击
            });

            await session.send('插件已双击操作完成。');
            return;
          } else if ([1, 2, 5].includes(operation)) {
            // 执行简单操作
            await page.evaluate((operation) => {
              const buttons = document.querySelectorAll('.right .menu-item:not(.disabled)');
              (buttons[operation - 1] as HTMLElement).click();
            }, operation);

            await session.send("操作已完成。");
            return;
          } else if (operation === 3) {
            // 重命名
            await page.evaluate(() => {
              const buttons = document.querySelectorAll('.right .menu-item:not(.disabled)');
              (buttons[2] as HTMLElement).click(); // 点击重命名
            });

            await session.send("请发送重命名的插件名称：");
            const newName = await session.prompt(config.wait_for_prompt * 1000);

            await page.evaluate((newName) => {
              const input = document.querySelector('.el-dialog .el-input__inner') as HTMLInputElement;
              input.value = newName;
              const event = new Event('input', { bubbles: true });
              input.dispatchEvent(event);
              const confirmButton = document.querySelector('.el-dialog__footer .el-button--primary') as HTMLElement;
              confirmButton.click();
            }, newName);

            await session.send("重命名操作已完成。");
            return;
          } else if (operation === 4) {
            // 移除插件
            await page.evaluate(() => {
              const buttons = document.querySelectorAll('.right .menu-item:not(.disabled)');
              (buttons[3] as HTMLElement).click(); // 点击移除插件
            });

            await page.evaluate(() => {
              const confirmButton = document.querySelector('.el-dialog__footer .el-button--danger') as HTMLElement;
              confirmButton.click();
            });

            await session.send("移除插件操作已完成。");
            return;
          }

        } catch (error) {
          ctx.logger.error('操作插件时出错:', error);
          await session.send("操作插件时出错，请重试。");
        } finally {
          // 自动关闭页面
          if (page) {
            await page.close();
          }
        }
      });
  }
}
