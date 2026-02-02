import { Schema, Logger, h, Context, Session } from "koishi";
import type { Config } from './index';

// 队列任务接口
interface QueueTask {
    session: Session;
    ret: string;
    options?: { video?: boolean; audio?: boolean; link?: boolean };
}

// 缓冲区任务接口
interface BufferTask {
    session: Session;
    ret: string;
    options?: { video?: boolean; audio?: boolean; link?: boolean };
    timestamp: number;
}

// Session 级别的任务接口
interface SessionTask {
    session: Session;
    sessioncontent: string;
    timestamp: number;
}

export class BilibiliParser {
    private lastProcessedUrls: Record<string, number> = {};
    private processingQueue: QueueTask[] = []; // 待处理队列
    private isProcessing: boolean = false; // 是否正在处理
    private bufferQueue: BufferTask[] = []; // 缓冲队列
    private bufferTimer: NodeJS.Timeout | null = null; // 缓冲定时器

    // Session 级别的队列控制
    private sessionQueue: SessionTask[] = []; // Session 缓冲队列
    private sessionTimer: NodeJS.Timeout | null = null; // Session 缓冲定时器
    private isProcessingSession: boolean = false; // 是否正在处理 Session

    constructor(private ctx: Context, private config: Config, private logger: Logger) { }

    public logInfo(...args: any[]) {
        if (this.config.loggerinfo) {
            (this.logger.info as (...args: any[]) => void)(...args);
        }
    }

    //  判断是否需要解析
    public async isProcessLinks(sessioncontent: string) {
        // 解析内容中的链接
        const links = this.link_type_parser(sessioncontent);
        if (links.length === 0) {
            return false; // 如果没有找到链接，返回 false
        }
        return links; // 返回解析出的链接
    }

    //提取链接
    public async extractLinks(session: Session, links: { type: string; id: string }[]) {
        let ret = "";
        if (!this.config.isfigure) {
            ret += h("quote", { id: session.messageId });
        }
        let countLink = 0;
        let tp_ret: string;

        // 循环检测链接类型
        for (const element of links) {
            if (countLink >= 1) ret += "\n";
            if (countLink >= this.config.parseLimit) {
                ret += "已达到解析上限…";
                break;
            }
            tp_ret = await this.type_processer(element);
            if (tp_ret == "") {
                if (this.config.showError)
                    ret = "无法解析链接信息。可能是 ID 不存在，或该类型可能暂不支持。";
                else
                    ret = null;
            } else {
                ret += tp_ret;
            }
            countLink++;
        }
        return ret;
    }

    //判断链接是否已经处理过
    public isLinkProcessedRecently(ret: string, channelId: string) {
        const lastretUrl = this.extractLastUrl(ret); // 提取 ret 最后一个 http 链接作为解析目标
        const currentTime = Date.now();

        //  channelId 作为 key 的一部分，分频道鉴别
        const channelKey = `${channelId}:${lastretUrl}`;

        if (lastretUrl && this.lastProcessedUrls[channelKey] && (currentTime - this.lastProcessedUrls[channelKey] < this.config.MinimumTimeInterval * 1000)) {
            this.ctx.logger.info(`重复出现，略过处理：\n ${lastretUrl} (频道 ${channelId})`);

            return true; // 已经处理过
        }

        // 更新该链接的最后处理时间，使用 channelKey
        if (lastretUrl) {
            this.lastProcessedUrls[channelKey] = currentTime;
        }
        return false; // 没有处理过
    }

    // 添加 session 到缓冲队列（middleware 入口调用）
    public async queueSession(session: Session, sessioncontent: string) {
        // 将 session 加入缓冲队列
        this.sessionQueue.push({ session, sessioncontent, timestamp: Date.now() });
        this.logInfo(`收到消息，Session缓冲区任务数: ${this.sessionQueue.length}`);

        // 清除之前的定时器
        if (this.sessionTimer) {
            clearTimeout(this.sessionTimer);
        }

        // 设置新的定时器，等待配置的延迟时间后处理
        this.sessionTimer = setTimeout(() => {
            this.flushSessionBuffer();
        }, this.config.bufferDelay * 1000);
    }

    // 将 session 缓冲区的任务转移到处理队列
    private flushSessionBuffer() {
        if (this.sessionQueue.length === 0) {
            return;
        }

        this.logInfo(`Session缓冲时间结束，开始处理 ${this.sessionQueue.length} 个消息`);

        // 启动 session 队列处理
        if (!this.isProcessingSession) {
            this.processSessionQueue();
        }
    }

    // 处理 session 队列中的任务
    private async processSessionQueue() {
        if (this.isProcessingSession || this.sessionQueue.length === 0) {
            return;
        }

        this.isProcessingSession = true;
        this.logInfo(`开始处理Session队列，总任务数: ${this.sessionQueue.length}`);

        while (this.sessionQueue.length > 0) {
            const task = this.sessionQueue.shift();
            this.logInfo(`处理Session (剩余: ${this.sessionQueue.length})`);

            try {
                await this.processSessionTask(task.session, task.sessioncontent);
            } catch (error) {
                this.logger.error('处理Session任务时发生错误:', error);
            }
        }

        this.isProcessingSession = false;
        this.logInfo('Session队列处理完成');
    }

    // 实际处理单个 session 任务
    private async processSessionTask(session: Session, sessioncontent: string) {
        this.logInfo(`[队列] 开始处理消息: ${sessioncontent.substring(0, 50)}...`);

        const links = await this.isProcessLinks(sessioncontent);
        if (!links) {
            this.logInfo(`[队列] 未检测到链接`);
            return;
        }

        this.logInfo(`[队列] 检测到 ${links.length} 个链接`);

        // 逐个处理链接
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            this.logInfo(`[队列] 处理第 ${i + 1}/${links.length} 个链接`);

            const ret = await this.extractLinks(session, [link]);
            if (ret && !this.isLinkProcessedRecently(ret, session.channelId)) {
                this.logInfo(`[队列] 开始下载视频`);
                // 直接处理，不再使用视频级别的缓冲
                await this.processVideoTask(session, ret, { video: true });
                this.logInfo(`[队列] 视频处理完成`);
            } else {
                this.logInfo(`[队列] 链接已处理过，跳过`);
            }
        }

        this.logInfo(`[队列] Session 处理完成`);
    }

    // 添加任务到缓冲区（已废弃，保留兼容性）
    public async processVideoFromLink(session: Session, ret: string, options: { video?: boolean; audio?: boolean; link?: boolean } = { video: true }) {
        // 将任务加入缓冲队列
        this.bufferQueue.push({ session, ret, options, timestamp: Date.now() });
        this.logInfo(`收到解析请求，缓冲区任务数: ${this.bufferQueue.length}`);

        // 清除之前的定时器
        if (this.bufferTimer) {
            clearTimeout(this.bufferTimer);
        }

        // 设置新的定时器，等待配置的延迟时间后处理
        this.bufferTimer = setTimeout(() => {
            this.flushBuffer();
        }, this.config.bufferDelay * 1000);
    }

    // 将缓冲区的任务转移到处理队列
    private flushBuffer() {
        if (this.bufferQueue.length === 0) {
            return;
        }

        this.logInfo(`缓冲时间结束，将 ${this.bufferQueue.length} 个任务加入处理队列`);

        // 将缓冲队列的任务转移到处理队列
        while (this.bufferQueue.length > 0) {
            const task = this.bufferQueue.shift();
            this.processingQueue.push({
                session: task.session,
                ret: task.ret,
                options: task.options
            });
        }

        // 启动队列处理
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    // 处理队列中的任务
    private async processQueue() {
        if (this.isProcessing || this.processingQueue.length === 0) {
            return;
        }

        this.isProcessing = true;
        this.logInfo(`开始处理队列，总任务数: ${this.processingQueue.length}`);

        while (this.processingQueue.length > 0) {
            const task = this.processingQueue.shift();
            this.logInfo(`处理任务 (剩余: ${this.processingQueue.length})`);

            try {
                await this.processVideoTask(task.session, task.ret, task.options);
            } catch (error) {
                this.logger.error('处理视频任务时发生错误:', error);
            }
        }

        this.isProcessing = false;
        this.logInfo('队列处理完成');
    }

    // 实际处理单个视频任务
    private async processVideoTask(session: Session, ret: string, options: { video?: boolean; audio?: boolean; link?: boolean } = { video: true }) {
        const lastretUrl = this.extractLastUrl(ret);
        this.logInfo(`处理视频: ${lastretUrl}`);

        let waitTipMsgId: string = null;
        // 等待提示语单独发送
        if (this.config.waitTip_Switch) {
            const result = await session.send(`${h.quote(session.messageId)}${this.config.waitTip_Switch}`);
            waitTipMsgId = Array.isArray(result) ? result[0] : result;
        }

        let videoElements: any[] = []; // 用于存储视频相关元素
        let textElements: any[] = []; // 用于存储图文解析元素
        let shouldPerformTextParsing = this.config.videoParseComponents.includes('text');

        // 先进行图文解析
        if (shouldPerformTextParsing) {
            let fullText: string;
            if (this.config.bVideoShowLink) {
                fullText = ret; // 发送完整信息
            } else {
                // 去掉最后一个链接
                fullText = ret.replace(lastretUrl, '');
            }

            // 分割文本
            const textParts = fullText.split('${~~~}');

            // 循环处理每个分割后的部分
            for (const part of textParts) {
                const trimmedPart = part.trim(); // 去除首尾空格
                if (trimmedPart) { // 确保不是空字符串
                    const parsedElements = h.parse(trimmedPart);

                    // 创建 message 元素
                    const messageElement = h('message', {
                        userId: session.userId,
                        nickname: session.author?.nickname || session.username,
                    }, parsedElements);

                    // 添加 message 元素到 textElements
                    textElements.push(messageElement);
                }
            }
        }

        // 视频/链接解析
        if (this.config.videoParseComponents.length > 0) {
            const fullAPIurl = `http://api.xingzhige.com/API/b_parse/?url=${encodeURIComponent(lastretUrl)}`;

            try {
                const responseData: any = await this.ctx.http.get(fullAPIurl);

                if (responseData.code === 0 && responseData.msg === "video" && responseData.data) {
                    const { bvid, cid, video } = responseData.data;
                    const bilibiliUrl = `https://api.bilibili.com/x/player/playurl?fnval=80&cid=${cid}&bvid=${bvid}`;
                    const playData: any = await this.ctx.http.get(bilibiliUrl);

                    if (playData.code === 0 && playData.data && playData.data.dash && playData.data.dash.duration) {
                        const videoDurationSeconds = playData.data.dash.duration;
                        const videoDurationMinutes = videoDurationSeconds / 60;

                        // 检查视频是否太短
                        if (videoDurationMinutes < this.config.Minimumduration) {

                            // 根据 Minimumduration_tip 的值决定行为
                            if (this.config.Minimumduration_tip === 'return') {
                                // 不返回文字提示，直接返回
                                return;
                            } else if (typeof this.config.Minimumduration_tip === 'object' && this.config.Minimumduration_tip !== null) {
                                // 返回文字提示
                                if (this.config.Minimumduration_tip.tipcontent) {
                                    if (this.config.Minimumduration_tip.tipanalysis) {
                                        videoElements.push(h.text(this.config.Minimumduration_tip.tipcontent));
                                    } else {
                                        await session.send(this.config.Minimumduration_tip.tipcontent);
                                    }
                                }

                                // 决定是否进行图文解析
                                shouldPerformTextParsing = this.config.Minimumduration_tip.tipanalysis === true;

                                // 如果不进行图文解析，清空已准备的文本元素
                                if (!shouldPerformTextParsing) {
                                    textElements = [];
                                }
                            }
                        }
                        // 检查视频是否太长
                        else if (videoDurationMinutes > this.config.Maximumduration) {

                            // 根据 Maximumduration_tip 的值决定行为
                            if (this.config.Maximumduration_tip === 'return') {
                                // 不返回文字提示，直接返回
                                return;
                            } else if (typeof this.config.Maximumduration_tip === 'object' && this.config.Maximumduration_tip !== null) {
                                // 返回文字提示
                                if (this.config.Maximumduration_tip.tipcontent) {
                                    if (this.config.Maximumduration_tip.tipanalysis) {
                                        videoElements.push(h.text(this.config.Maximumduration_tip.tipcontent));
                                    } else {
                                        await session.send(this.config.Maximumduration_tip.tipcontent);
                                    }
                                }

                                // 决定是否进行图文解析
                                shouldPerformTextParsing = this.config.Maximumduration_tip.tipanalysis === true;

                                // 如果不进行图文解析，清空已准备的文本元素
                                if (!shouldPerformTextParsing) {
                                    textElements = [];
                                }
                            }
                        } else {
                            // 视频时长在允许范围内，处理视频
                            let videoData = video.url;

                            if (this.config.filebuffer) {
                                try {
                                    // 使用 Node.js 原生 fetch 下载视频
                                    const response = await fetch(video.url, {
                                        headers: {
                                            'User-Agent': this.config.userAgent,
                                            'Referer': 'https://www.bilibili.com/'
                                        }
                                    });

                                    if (!response.ok) {
                                        throw new Error(`HTTP ${response.status}`);
                                    }

                                    // 检查文件大小
                                    const contentLength = response.headers.get('content-length');
                                    const fileSizeMB = contentLength ? parseInt(contentLength) / 1024 / 1024 : 0;
                                    this.logInfo(`[下载] 视频大小: ${fileSizeMB.toFixed(2)}MB`);

                                    // 检查是否超过配置的最大大小
                                    const maxSize = this.config.MaximumFileSizeMB;
                                    this.logInfo(`[下载] 配置的最大大小: ${maxSize}MB`);

                                    if (maxSize > 0 && fileSizeMB > maxSize) {
                                        this.logger.warn(`[下载] 文件过大 (${fileSizeMB.toFixed(2)}MB > ${maxSize}MB)，跳过发送`);
                                        // 文件过大，直接返回，不发送视频
                                        return;
                                    } else {
                                        this.logInfo(`[下载] 开始下载并转换为Base64...`);

                                        // 获取 MIME 类型
                                        const contentType = response.headers.get('content-type');
                                        const mimeType = contentType ? contentType.split(';')[0].trim() : 'video/mp4';

                                        this.logInfo(`[下载] 读取响应体...`);
                                        // 读取响应体并转换
                                        const arrayBuffer = await response.arrayBuffer();
                                        this.logInfo(`[下载] 创建Buffer...`);
                                        const buffer = Buffer.from(arrayBuffer);
                                        this.logInfo(`[下载] 转换为Base64...`);
                                        const base64Data = buffer.toString('base64');
                                        videoData = `data:${mimeType};base64,${base64Data}`;

                                        this.logInfo(`[下载] 视频下载完成，已转换为Base64`);
                                    }
                                } catch (error) {
                                    this.logger.error("下载视频失败:", error);
                                    // 出错时继续使用原始URL
                                }
                            }

                            if (videoData) {
                                if (options.link) {
                                    // 如果是链接选项，仍然使用原始URL
                                    videoElements.push(h.text(video.url));
                                } else if (options.audio) {
                                    videoElements.push(h.audio(videoData));
                                } else {
                                    if (this.config.videoParseComponents.includes('log')) {
                                        this.logInfo(video.url);
                                    }
                                    if (this.config.videoParseComponents.includes('link')) {
                                        videoElements.push(h.text(video.url));
                                    }
                                    if (this.config.videoParseComponents.includes('video')) {
                                        videoElements.push(h.video(videoData));
                                    }
                                }
                            } else {
                                throw new Error("解析视频直链失败");
                            }

                        }
                    } else {
                        throw new Error("获取播放数据失败");
                    }
                } else {
                    throw new Error("解析视频信息失败或非视频类型内容");
                }
            } catch (error) {
                this.logger.error("请求解析 API 失败或处理出错:", error);
            }
        }

        // 准备发送的所有元素
        let allElements = [...textElements, ...videoElements];

        if (allElements.length === 0) {
            return;
        }

        // 合并转发处理
        if (this.config.isfigure && (session.platform === "onebot" || session.platform === "red")) {
            this.logInfo(`使用合并转发，正在合并消息。`);

            // 创建 figure 元素
            const figureContent = h('figure', {
                children: allElements
            });

            if (this.config.loggerinfofulljson) {
                this.logInfo(JSON.stringify(figureContent, null, 2));
            }

            // 发送合并转发消息
            await session.send(figureContent);
        } else {
            // 没有启用合并转发，按顺序发送所有元素
            for (const element of allElements) {
                await session.send(element);
            }
        }

        this.logInfo(`机器人已发送完整消息。`);
        if (waitTipMsgId) {
            await session.bot.deleteMessage(session.channelId, waitTipMsgId);
        }
        return;
    }

    // 提取最后一个URL
    private extractLastUrl(text: string): string | null {
        const urlPattern = /https?:\/\/[^\s]+/g;
        const urls = text.match(urlPattern);
        return urls ? urls.pop() : null;
    }

    // 检测BV / AV 号并转换为URL
    public convertBVToUrl(text: string): string[] {
        const bvPattern = /(?:^|\s)(BV\w{10})(?:\s|$)/g;
        const avPattern = /(?:^|\s)(av\d+)(?:\s|$)/g;
        const matches: string[] = [];
        let match: RegExpExecArray;

        // 查找 BV 号
        while ((match = bvPattern.exec(text)) !== null) {
            matches.push(`https://www.bilibili.com/video/${match[1]}`);
        }

        // 查找 AV 号
        while ((match = avPattern.exec(text)) !== null) {
            matches.push(`https://www.bilibili.com/video/${match[1]}`);
        }

        return matches;
    }

    private numeral(number: number): string | number {
        if (this.config.useNumeral) {
            if (number >= 10000 && number < 100000000) {
                return (number / 10000).toFixed(1) + "万";
            }
            else if (number >= 100000000) {
                return (number / 100000000).toFixed(1) + "亿";
            }
            else {
                return number.toString();
            }
        }
        else {
            return number;
        }
    }

    /**
     * 解析 ID 类型
     * @param id 视频 ID
     * @returns type: ID 类型, id: 视频 ID
     */
    private vid_type_parse(id: string): { type: string | null; id: string | null } {
        var idRegex = [
            {
                pattern: /av([0-9]+)/i,
                type: "av",
            },
            {
                pattern: /bv([0-9a-zA-Z]+)/i,
                type: "bv",
            },
        ];
        for (const rule of idRegex) {
            var match = id.match(rule.pattern);
            if (match) {
                return {
                    type: rule.type,
                    id: match[1],
                };
            }
        }
        return {
            type: null,
            id: null,
        };
    }

    /**
     * 根据视频 ID 查找视频信息
     * @param id 视频 ID
     * @returns 视频信息 Json
     */
    private async fetch_video_info(id: string): Promise<any> {
        var ret: any;
        const vid = this.vid_type_parse(id);
        switch (vid["type"]) {
            case "av":
                ret = await this.ctx.http.get("https://api.bilibili.com/x/web-interface/view?aid=" + vid["id"], {
                    headers: {
                        "User-Agent": this.config.userAgent,
                    },
                });
                break;
            case "bv":
                ret = await this.ctx.http.get("https://api.bilibili.com/x/web-interface/view?bvid=" + vid["id"], {
                    headers: {
                        "User-Agent": this.config.userAgent,
                    },
                });
                break;
            default:
                ret = null;
                break;
        }
        return ret;
    }

    /**
     * 生成视频信息
     * @param id 视频 ID
     * @returns 文字视频信息
     */
    private async gen_context(id: string): Promise<string | null> {
        const info = await this.fetch_video_info(id);
        if (!info || !info["data"])
            return null;

        let description = info["data"]["desc"];
        // 根据配置处理简介
        const maxLength = this.config.bVideoShowIntroductionTofixed;
        if (description.length > maxLength) {
            description = description.substring(0, maxLength) + '...';
        }
        // 定义占位符对应的数据
        const placeholders: Record<string, string> = {
            '${标题}': info["data"]["title"],
            '${UP主}': info["data"]["owner"]["name"],
            '${封面}': `<img src="${info["data"]["pic"]}"/>`,
            '${简介}': description, // 使用处理后的简介
            '${点赞}': `${this.numeral(info["data"]["stat"]["like"])}`,
            '${投币}': `${this.numeral(info["data"]["stat"]["coin"])}`,
            '${收藏}': `${this.numeral(info["data"]["stat"]["favorite"])}`,
            '${转发}': `${this.numeral(info["data"]["stat"]["share"])}`,
            '${观看}': `${this.numeral(info["data"]["stat"]["view"])}`,
            '${弹幕}': `${this.numeral(info["data"]["stat"]["danmaku"])}`,
            '${tab}': `<pre>\t</pre>`
        };

        // 根据配置项中的格式替换占位符
        let ret = this.config.bVideo_area;
        for (const [placeholder, value] of Object.entries(placeholders)) {
            ret = ret.replace(new RegExp(placeholder.replace(/\$/g, '\\$'), 'g'), value);
        }

        // 根据 ID 偏好添加视频链接
        switch (this.config.bVideoIDPreference) {
            case "bv":
                ret += `\nhttps://www.bilibili.com/video/${info["data"]["bvid"]}`;
                break;
            case "av":
                ret += `\nhttps://www.bilibili.com/video/av${info["data"]["aid"]}`;
                break;
            default:
                break;
        }

        return ret;
    }

    /**
    * 链接类型解析
    * @param content 传入消息
    * @returns type: "链接类型", id :"内容ID"
    */
    private link_type_parser(content: string): { type: string; id: string }[] {
        // 先替换转义斜杠
        content = content.replace(/\\\//g, '/');
        var linkRegex = [
            {
                pattern: /bilibili\.com\/video\/([ab]v[0-9a-zA-Z]+)/gim,
                type: "Video",
            },
            {
                pattern: /b23\.tv(?:\\)?\/([0-9a-zA-Z]+)/gim,
                type: "Short",
            },
            {
                pattern: /bili(?:22|23|33)\.cn\/([0-9a-zA-Z]+)/gim,
                type: "Short",
            },
            {
                pattern: /bili2233\.cn\/([0-9a-zA-Z]+)/gim,
                type: "Short",
            },
        ];
        var ret: { type: string; id: string }[] = [];
        for (const rule of linkRegex) {
            var match: RegExpExecArray;
            let lastID: string;
            while ((match = rule.pattern.exec(content)) !== null) {
                if (lastID == match[1])
                    continue;
                ret.push({
                    type: rule.type,
                    id: match[1],
                });
                lastID = match[1];
            }
        }
        return ret;
    }

    /**
    * 类型执行器
    * @param element 链接列表
    * @returns 解析来的文本
    */
    private async type_processer(element: { type: string; id: string }): Promise<string> {
        var ret = "";
        switch (element["type"]) {
            case "Video":
                const video_info = await this.gen_context(element["id"]);
                if (video_info != null)
                    ret += video_info;
                break;

            case "Short":
                const typed_link = this.link_type_parser(await this.get_redir_url(element["id"]));
                for (const element of typed_link) {
                    const final_info = await this.type_processer(element);
                    if (final_info != null)
                        ret += final_info;
                    break;
                }
                break;
        }
        return ret;
    }

    /**
    * 根据短链接重定向获取正常链接
    * @param id 短链接 ID
    * @returns 正常链接
    */
    private async get_redir_url(id: string): Promise<string | null> {
        var data = await this.ctx.http.get("https://b23.tv/" + id, {
            redirect: "manual",
            headers: {
                "User-Agent": this.config.userAgent,
            },
        });
        const match = data.match(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"/i);
        if (match)
            return match[1];
        else
            return null;
    }
}
