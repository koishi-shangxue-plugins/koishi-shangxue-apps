import { Context, Schema, Session } from "koishi";
import fs from 'node:fs';
import path from 'node:path';

// 扩展 Session 类型以支持 QQ 适配器
declare module 'koishi' {
    interface Session {
        qq?: {
            sendMessage(channelId: string, content: any): Promise<any>;
            sendPrivateMessage(userId: string, content: any): Promise<any>;
            acknowledgeInteraction(interactionId: string, data: { code: number }): Promise<any>;
        };
        qqguild?: {
            sendMessage(channelId: string, content: any): Promise<any>;
        };
    }
}

// 配置类型定义
interface Config {
    command_name: string;
    markdown_id: string;
    json_button_id: string;
    file_name: string[];
    type_switch: 'json' | 'markdown' | 'raw';
    Allow_INTERACTION_CREATE: boolean;
    consoleinfo: boolean;
}

export const name = "qq-markdown-button";
export const reusable = true; // 声明此插件可重用
export const inject = {
    // required: [''],
    optional: ["database"]
};
export const usage = `
<div>
<p>本插件可帮助你自定义QQ官方机器人按钮菜单，支持以下三种类型的菜单配置：</p>
<ol>
<li><strong>JSON 按钮</strong>：可以发送带有交互按钮的JSON消息。</li>
<li><strong>被动模板 Markdown</strong>：适用于发送自定义的Markdown模板消息。</li>
<li><strong>原生 Markdown</strong>：支持发送更复杂的原生Markdown消息。</li>
</ol>

<h3>如何配置</h3>
<ul>
<li>在左侧活动栏找到【资源管理器】->【data】->【qq-markdown-button】->【按钮菜单配置1】目录，在该目录下，你会看到对应的文件夹下有<code>.md</code> 和 <code>.json</code> 文件。</li>
<li>根据你选择的菜单类型，编辑对应的 <code>.md</code> 和 <code>.json</code> 文件，修改你的菜单配置。</li>
</ul>

<h3>关于变量替换</h3>
<p>在配置文件（例如 <code>.json</code>）中，你可能会看到一些变量占位符，如：</p>
<ul>
<li><code>\${session.messageId}</code>：运行时会替换为当前会话的消息ID。</li>
<li><code>\${INTERACTION_CREATE}</code>：运行时会替换为当前回调按钮的interaction_id。</li>
<li><code>\${markdown}</code>：会被替换为从对应 <code>.md</code> 文件读取的Markdown内容。</li>
<li><code>\${0}</code>, <code>\${1}</code>, ...：这些数字占位符用于获取命令参数。例如，如果命令是 <code>/mycommand arg1 arg2</code>，那么 <code>\${0}</code> 会被替换为 <code>arg1</code>，<code>\${1}</code> 会被替换为 <code>arg2</code>。</li>
<li>当命令没有提供足够的参数时（例如，命令是 <code>/mycommand arg1</code>，但模板中使用了 <code>\${1}</code>），未提供的数字占位符将自动被替换为字符串 <code>"undefined"</code>。</li>
</ul>
<p>无需手动修改这些变量，它们将在运行时自动替换为相应的真实值。</p>

---

<p>支持重用，你可以开多个这个插件，然后改成不同的指令名称/文件夹名称，以注册多个按钮菜单功能</p>
<p>本插件会自动使用对应的文件夹下的 json / markdown 文件来发送消息<br>使用多重配置时，你通常只需要修改 <code>按钮菜单配置1</code> 那一行</p>
<p>不要手动重命名 json/md文件！</p>
<hr>
<p>赶快选择你需要的配置，开始自定义你的菜单吧！</p>
<p>更多说明 <a href="https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/qq-markdown-button" target="_blank">详见➩项目README</a></p>

<p>相关链接：</p>
<ul>
<li><a href="https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/qq-markdown-button" target="_blank">https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/qq-markdown-button</a></li>
<li><a href="https://forum.koishi.xyz/t/topic/10439" target="_blank">https://forum.koishi.xyz/t/topic/10439</a></li>
</ul>
</div>
`;

export const Config = Schema.intersect([
    Schema.object({
        command_name: Schema.string().default('按钮菜单').description('注册的指令名称'),
        markdown_id: Schema.string().default('123456789_1234567890').description('markdown模板的ID'),
        json_button_id: Schema.string().default('123456789_1234567890').description('按钮模板的ID'),
    }).description('基础设置'),
    Schema.object({
        file_name: Schema.array(String).role('table').description('存储文件的文件夹名称<br>请依次填写 相对于`koishi根目录`的 **文件夹** 路径<br>本插件会自动使用对应的文件夹下的 json / markdown 文件来发送消息<br>使用多重配置时，你通常只需要修改 `按钮菜单配置1` 那一行')
            .default([
                "data",
                "qq-markdown-button",
                "按钮菜单配置1"
            ]),
        type_switch: Schema.union([
            Schema.const('json').description('json按钮（./json/json.json）'),
            Schema.const('markdown').description('被动md，模板md（./markdown/markdown.json）'),
            Schema.const('raw').description('原生md（./raw/raw_markdown.json 、 ./raw/raw_markdown.md）'),
        ]).role('radio').description('选择菜单发送方式。<br>即 使用的json文件'),
    }).description('发送设置'),
    Schema.object({
        Allow_INTERACTION_CREATE: Schema.boolean().default(false).description("是否自动执行所有回调按钮内容（通过`session.execute`）"),
    }).description('高级设置'),

    Schema.object({
        consoleinfo: Schema.boolean().default(false).description("日志调试模式`推荐主动广播时开启，以查看日志错误`"),
    }).description('调试设置'),
])

export function apply(ctx: Context, config: Config) {

    ctx.on('ready', () => {
        // 使用配置项中的 file_name 数组构建 baseDir 路径
        const baseDirArray = [ctx.baseDir].concat(config.file_name);
        const baseDir = path.join(...baseDirArray);
        logInfo(baseDir, undefined)
        // 确保目录存在，如果不存在则创建 (包括子目录)
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }
        const filesToCopy = {
            json: ['json.json'],
            markdown: ['markdown.json'],
            raw: ['raw_markdown.json', 'raw_markdown.md'],
        };
        // 复制文件到配置的目录下，并按照新的子目录结构存放
        for (const type in filesToCopy) {
            const fileList = filesToCopy[type as keyof typeof filesToCopy];
            if (fileList) {
                fileList.forEach((file: string) => {
                    const srcPath = path.join(__dirname, '..', 'qq', type, file); // 源文件路径，编译后 __dirname 在 lib 目录
                    const destPath = path.join(baseDir, type, file);       // 目标文件路径，保持新的目录结构
                    // 确保目标目录存在
                    const destDir = path.dirname(destPath);
                    if (!fs.existsSync(destDir)) {
                        fs.mkdirSync(destDir, { recursive: true });
                    }
                    if (!fs.existsSync(destPath)) {
                        fs.copyFileSync(srcPath, destPath);
                    }
                });
            }
        }
        if (config.Allow_INTERACTION_CREATE) {
            ctx.on("interaction/button", async (session: Session) => {
                const button = session?.event?.button;
                const buttoncontent = button && 'data' in button ? (button as Record<string, unknown>).data : undefined;
                if (buttoncontent) {
                    logInfo(`接收到回调按钮内容：\n${buttoncontent}`, undefined)
                    try {
                        const eventData = session.event as Record<string, any>;
                        const interactionId = eventData._data?.id;
                        if (session.qq && interactionId) {
                            session.qq.acknowledgeInteraction(interactionId, { code: 0 }).catch((error: unknown) => {
                                ctx.logger.error(`执行 acknowledgeInteraction 时出错 (后台任务):`, error);
                            });
                        }
                        await session.execute(`${buttoncontent}`)
                    } catch (error) {
                        ctx.logger.error(`执行 acknowledgeInteraction 时出错:`, error);
                    }
                    return
                }
            })
        }

        ctx.command(`${config.command_name} [...args]`, '发送按钮菜单', { strictOptions: true })
            .action(async ({ session }, ...args: string[]) => {
                if (!session) return;
                if (!(session.platform === "qq" || session.platform === "qqguild")) {
                    await session.send(`仅支持QQ官方平台使用本指令。`)
                    return;
                }
                const type = config.type_switch;
                const eventData = session.event as Record<string, any>;
                const INTERACTION_CREATE = eventData._data?.id || '';
                let Menu_message;
                try {
                    let jsonFilePath: string | undefined, mdFilePath: string | null;
                    if (type === 'json') {
                        jsonFilePath = path.join(baseDir, 'json', 'json.json');
                        mdFilePath = null; // json 类型不需要 md 文件
                    } else if (type === 'markdown') {
                        jsonFilePath = path.join(baseDir, 'markdown', 'markdown.json');
                        mdFilePath = null; // 被动模板 md 类型也不需要额外的 md 文件，内容在 json 中
                    } else if (type === 'raw') {
                        jsonFilePath = path.join(baseDir, 'raw', 'raw_markdown.json');
                        mdFilePath = path.join(baseDir, 'raw', 'raw_markdown.md');
                    }

                    if (jsonFilePath) {
                        Menu_message = await processMarkdownCommand(jsonFilePath, mdFilePath, session, config, { INTERACTION_CREATE: INTERACTION_CREATE }, args);
                        logInfo("完整的 Menu_message 内容为：", Menu_message);
                        await sendsomeMessage(Menu_message, session);
                    }
                } catch (error) {
                    ctx.logger.error(`处理命令时出错: ${error}`);
                }
            });


        function logInfo(message: unknown, message2?: unknown) {
            if (config.consoleinfo) {
                if (message2 !== undefined) {
                    ctx.logger.info(message, message2)
                } else {
                    ctx.logger.info(message);
                }
            }
        }

        async function sendsomeMessage(message: unknown, session: Session) {
            try {
                const { guild, user } = session.event;
                const { qq, qqguild, channelId } = session;
                if (guild?.id) {
                    if (qq) {
                        await qq.sendMessage(channelId, message);
                    } else if (qqguild) {
                        await qqguild.sendMessage(channelId, message);
                    }
                } else if (user?.id && qq) {
                    await qq.sendPrivateMessage(user.id, message);
                }
            } catch (error) {
                ctx.logger.error(`发送markdown消息时出错:`, error);
            }
        }

        function processMarkdownCommand(
            jsonFilePath: string,
            mdFilePath: string | null,
            session: Session,
            config: Config,
            variables: Record<string, unknown> = {},
            args: string[] = []
        ): unknown {
            try {
                const rawJsonData = fs.readFileSync(jsonFilePath, 'utf-8');
                let markdownContent = mdFilePath ? fs.readFileSync(mdFilePath, 'utf-8') : '';
                const allVariables: Record<string, unknown> = {
                    ...variables,
                    session,
                    config,
                    args
                };

                const replacePlaceholders = (data: unknown): unknown => {
                    if (typeof data === 'string') {
                        return data.replace(/\$\{([^}]+)\}/g, (_, key) => {
                            // 尝试直接从 allVariables 中获取
                            let value: unknown = key.split('.').reduce((prev: unknown, curr: string) => {
                                return prev && typeof prev === 'object' && curr in prev
                                    ? (prev as Record<string, unknown>)[curr]
                                    : undefined;
                            }, allVariables);

                            // 如果 key 是数字，尝试从 args 数组中获取
                            if (value === undefined && /^\d+$/.test(key)) {
                                const index = parseInt(key, 10);
                                if (args && index >= 0 && index < args.length) {
                                    value = args[index];
                                } else {
                                    value = 'undefined';
                                }
                            }

                            return value !== undefined ? String(value) : `\${${key}}`;
                        });
                    } else if (Array.isArray(data)) {
                        return data.map(replacePlaceholders);
                    } else if (typeof data === 'object' && data !== null) {
                        return Object.fromEntries(
                            Object.entries(data).map(([k, v]) => [k, replacePlaceholders(v)])
                        );
                    }
                    return data;
                };

                // 保留换行符，QQ markdown 需要换行符
                markdownContent = String(replacePlaceholders(markdownContent));
                allVariables.markdown = markdownContent;
                const rawJsonObject = JSON.parse(rawJsonData);
                const replacedJsonObject = replacePlaceholders(rawJsonObject);

                // 根据 session.messageId 是否存在，动态删除 JSON 对象中不需要的 ID 字段
                if (typeof replacedJsonObject === 'object' && replacedJsonObject !== null) {
                    const jsonObj = replacedJsonObject as Record<string, unknown>;
                    if (session.messageId) {
                        if ('msg_id' in jsonObj) {
                            delete jsonObj.event_id;
                        }
                    } else {
                        if ('event_id' in jsonObj) {
                            delete jsonObj.msg_id;
                        }
                    }
                }

                return replacedJsonObject;
            } catch (error) {
                ctx.logger.error(`读取或解析文件时出错:`, error);
                return '处理文件时出错。';
            }
        }



    });
}
