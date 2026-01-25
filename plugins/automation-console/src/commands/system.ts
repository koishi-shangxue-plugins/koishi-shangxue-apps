import { Context } from "koishi";
import { Config, PageInstance } from "../types";
import { ensureUIControl, closeUIIfEnabled } from "../utils";

/**
 * 注册系统相关命令
 */
export function registerSystemCommands(
  ctx: Context,
  config: Config,
  pageRef: { current: PageInstance },
  commandNames: {
    automation: string | null;
    restart: string | null;
    yarnUpToLatest: string | null;
    cancanLogs: string | null;
    cancanUI: string | null;
    openUI: string | null;
    closeUI: string | null;
  }
) {
  const { automation, restart, yarnUpToLatest, cancanLogs, cancanUI, openUI, closeUI } = commandNames;

  // 软重启Koishi
  if (restart) {
    ctx.command(`${automation || "automation-console"}/${restart}`, "重启Koishi控制台", {
      authority: config.table2.find(item => item.command === "软重启")?.command_authority
    })
      .action(async ({ session }) => {
        if (!await ensureUIControl(pageRef.current, config, session, openUI)) return;

        try {
          await pageRef.current!.click('a[href^="/plugins/"]');

          // 点击【全局设置】
          await pageRef.current!.waitForSelector('.item .label[title="全局设置"]');
          await pageRef.current!.click('.item .label[title="全局设置"]');

          // 提示重启
          await session.send("正在【重启Koishi】...");

          // 点击重载按钮
          await pageRef.current!.evaluate(() => {
            const buttons = document.querySelectorAll('.right .menu-item:not(.disabled)');
            if (buttons.length >= 3) {
              (buttons[0] as HTMLElement).click(); // 点击第一个可用按钮【重载插件】
            }
          });

          // 重启后关闭页面实例
          await session.execute(`${closeUI}`);
          pageRef.current = null;
        } catch (error) {
          ctx.logger.error('重启Koishi时出错:', error);
          await session.send("重启Koishi时出错，请重试。");
        }
      });
  }

  // 小火箭更新依赖
  if (yarnUpToLatest) {
    ctx.command(`${automation || "automation-console"}/${yarnUpToLatest}`, "小火箭更新", {
      authority: config.table2.find(item => item.command === "小火箭更新依赖")?.command_authority
    })
      .action(async ({ session }) => {
        if (!await ensureUIControl(pageRef.current, config, session, openUI)) return;

        try {
          // 切换到 /dependencies 页面
          await pageRef.current!.click('a[href^="/dependencies"]');

          // 在页面上下文中执行脚本，查找按钮
          const canUpdate = await pageRef.current!.evaluate(() => {
            const buttons = document.querySelectorAll('.right .menu-item');
            const updateButton = buttons[0] as HTMLElement; // 假设第一个是【全部更新】按钮
            const refreshButton = buttons[3] as HTMLElement; // 假设第四个是【刷新】按钮

            if (!updateButton || updateButton.classList.contains('disabled')) {
              return false; // 【全部更新】按钮不可按
            }

            refreshButton.click(); // 点击【刷新】按钮
            return true; // 【全部更新】按钮可用
          });

          if (!canUpdate) {
            await session.send("当前已经全部是最新依赖了，无需更新");
            await closeUIIfEnabled(session, config, closeUI);
            return;
          }

          // 等待配置的时间
          await new Promise(resolve => setTimeout(resolve, config.resolvetimeout * 1000));

          // 点击【全部更新】按钮
          await pageRef.current!.evaluate(() => {
            const buttons = document.querySelectorAll('.right .menu-item');
            const updateButton = buttons[0] as HTMLElement;
            updateButton.click();
          });

          // 点击【应用更改】按钮
          await pageRef.current!.evaluate(() => {
            const buttons = document.querySelectorAll('.right .menu-item');
            const applyChangesButton = buttons[1] as HTMLElement; // 假设第二个是【应用更改】按钮
            applyChangesButton.click();
          });

          // 等待确认安装弹窗并点击【确认安装】
          await pageRef.current!.waitForSelector('.el-button--primary', { visible: true });
          await pageRef.current!.evaluate(() => {
            const confirmButton = document.querySelector('.el-button--primary') as HTMLElement;
            confirmButton.click();
          });

          await session.send("已确认安装");
          await closeUIIfEnabled(session, config, closeUI);
        } catch (error) {
          ctx.logger.error("小火箭更新依赖时出错:", error);
          await session.send("更新依赖失败，请重试。");
          await closeUIIfEnabled(session, config, closeUI);
        }
      });
  }

  // 查看日志
  if (cancanLogs) {
    ctx.command(`${automation || "automation-console"}/${cancanLogs}`, "查看日志截图", {
      authority: config.table2.find(item => item.command === "查看日志")?.command_authority
    })
      .action(async ({ session }) => {
        if (!await ensureUIControl(pageRef.current, config, session, openUI)) return;
        // 切换到 /logs 页面
        await pageRef.current!.click('a[href^="/logs"]');
        // 反馈状态
        await session.execute(`${cancanUI}`);
        await closeUIIfEnabled(session, config, closeUI);
        return;
      });
  }
}
