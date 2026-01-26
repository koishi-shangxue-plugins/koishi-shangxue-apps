import { Context } from "koishi";
import { Config, PageInstance } from "./types";

/**
 * 获取指令名称
 */
export function getCommandName(config: Config, command: string): string | null {
  const entry = config.commandTable.find(item => item.command === command);
  return entry ? entry.commandname : null;
}

/**
 * 获取指令权限等级
 */
export function getCommandAuthority(config: Config, command: string): number | null {
  const entry = config.commandTable.find(item => item.command === command);
  return entry ? entry.command_authority : null;
}

/**
 * 获取控制台 URL
 */
export function getConsoleUrl(ctx: Context, config: Config, path: string = ''): string {
  const port = config.accessPort || ctx.server?.port;
  if (!port) {
    throw new Error('无法获取控制台端口');
  }
  return `http://127.0.0.1:${port}${path}`;
}

/**
 * 日志输出函数
 */
export function createLogger(ctx: Context, config: Config) {
  return (message: string) => {
    if (config.loggerinfo) {
      ctx.logger.info(message);
    }
  };
}

/**
 * 处理登录并跳转到目标页面
 */
export async function handleLoginAndNavigate(
  ctx: Context,
  config: Config,
  page: PageInstance,
  targetPath: string
): Promise<void> {
  if (!page) return;

  const baseUrl = getConsoleUrl(ctx, config);

  // 使用配置的额外等待时间（毫秒）
  const extraTimeout = config.extraWaitTimeout * 1000;

  // 如果需要登录，先访问登录页面
  if (config.enable_auth) {
    const loginUrl = `${baseUrl}/login`;
    await page.goto(loginUrl, { waitUntil: 'networkidle2' });

    // 等待登录表单加载
    await page.waitForSelector('div.login-form input', { timeout: extraTimeout });

    // 获取登录表单的输入框
    const [usernameInput, passwordInput] = await page.$$('div.login-form input');

    // 清空输入框中的内容（可能被浏览器或 webui 记住）
    await usernameInput.click({ clickCount: 3 }); // 三击全选
    await usernameInput.press('Backspace'); // 删除
    await passwordInput.click({ clickCount: 3 }); // 三击全选
    await passwordInput.press('Backspace'); // 删除

    // 填写用户名和密码
    await usernameInput.type(config.text);
    await passwordInput.type(config.secret);

    // 点击登录按钮并等待导航完成
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: extraTimeout }),
      page.click('div.login-form button:nth-child(2)'),
    ]);

    // 等待一小段时间确保登录完成
    await new Promise(resolve => setTimeout(resolve, 500));
  } else {
    // 如果不需要登录，先访问首页
    await page.goto(baseUrl, { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 使用路由导航而不是直接访问 URL
  // 在页面中创建一个临时按钮并点击它来触发路由跳转
  await page.evaluate((targetPath) => {
    // 创建一个临时按钮
    const button = document.createElement('button');
    button.id = 'temp-nav-button';
    button.style.position = 'fixed';
    button.style.top = '10px';
    button.style.left = '10px';
    button.style.zIndex = '99999';
    button.textContent = 'Navigate';

    // 添加点击事件，使用 router 进行导航
    button.onclick = () => {
      // 尝试使用 Vue Router 进行导航
      const app = (window as any).__VUE_APP__;
      if (app && app.$router) {
        app.$router.push(targetPath);
      } else {
        // 如果找不到 router，使用 history API
        window.history.pushState({}, '', targetPath);
        // 触发 popstate 事件
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    };

    document.body.appendChild(button);
  }, targetPath);

  // 等待按钮创建完成
  await new Promise(resolve => setTimeout(resolve, 200));

  // 点击按钮触发路由跳转
  await page.click('#temp-nav-button');

  // 等待路由跳转完成
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 移除临时按钮
  await page.evaluate(() => {
    const button = document.getElementById('temp-nav-button');
    if (button) {
      button.remove();
    }
  });
}
