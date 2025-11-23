import { Context, h, Session, Universal } from "koishi";
import { Config, usage } from "./config";
import { logInfo, logError, logInfoformat, replacePlaceholders } from "./utils";
import { determineImagePath, getImageAsBase64, getRandomEmojiHubCommand, listAllCommands, uploadImageToChannel } from "./core";
import url from "node:url";
import { markdown, command_list_markdown, sendmarkdownMessage } from "./markdown";

import { } from "koishi-plugin-cron";
import { } from "koishi-plugin-canvas";

export const inject = {
  optional: ['canvas',]
};

export const name = 'emojihub-bili';
export const reusable = true;

export { Config, usage };

export function apply(ctx: Context, config: Config) {
  const emojihub_bili_codecommand = config.emojihub_bili_command;

  ctx.i18n.define("zh-CN",
    {
      commands: {
        [emojihub_bili_codecommand]: {
          description: `表情包功能`,
          messages: {
            "notfound_txt": "ERROR！找不到文件或文件为空！指令：{0}",
            "List_of_emojis": "可用的表情包指令：{0}",
            "notallowednum": `{0}次超出单次返回最大值\n请使用指令：{1} -${config.optionsname} {2}`,
          }
        },
        [config.emojihub_onemore]: {
          description: `触发上次的表情包`,
          messages: {
            "nocommand": `没有找到上一个命令，请先执行一个命令！\n➣例如： ${config.emojihub_randompic}`,
          }
        },
        [config.emojihub_randompic]: {
          description: `从全部表情包里随机抽`,
          messages: {
            "noemoji": "没有任何表情包配置，请检查插件配置项！",
          }
        }
      }
    }
  );

  const lastCommandByChannel = {};

  function updateLastCommand(differentiationID: string, command: string) {
    lastCommandByChannel[differentiationID] = command;
    logInfo(config, '记录到command为： ' + command + ' 区别ID： ' + differentiationID);
  }

  async function sendMultipleEmojis(session: Session, command: string, num: number) {
    const maxAllowed = config.maxexecutetime || 10; // 使用配置中的最大数量，默认为10
    if (num > maxAllowed) {
      await session.send(h.text(session.text(`commands.${emojihub_bili_codecommand}.messages.notallowednum`, [num, command, maxAllowed])));
      return; // 不继续执行
    }
    const numToSend = Math.min(num || 1, maxAllowed); // 确定要发送的数量，不超过最大值
    for (let i = 0; i < numToSend; i++) {
      // 如果是“再来一张”指令，则需要特殊处理
      if (command === config.emojihub_onemore) {
        const identifier = config.repeatCommandDifferentiation === 'userId' ? session.userId : session.channelId;
        const lastCommand = lastCommandByChannel[identifier];
        if (lastCommand) {
          await session.execute(lastCommand);
        } else {
          await session.send(session.text(".nocommand"));
          return; // 如果没有上一个命令，则直接返回，不再继续循环
        }
      } else {
        // 对于其他指令，直接执行
        await session.execute(command);
      }
    }
  }

  ctx.command(config.emojihub_bili_command)
    .action(async ({ session }) => {
      const txtCommandList = listAllCommands(config);
      logInfo(config, `指令列表txtCommandList：  ` + txtCommandList);

      if (config.markdown_button_mode_without_emojilist_keyboard && (config.markdown_button_mode === "markdown" || config.markdown_button_mode === "raw" || config.markdown_button_mode === "json" || config.markdown_button_mode === "markdown_raw_json")) {
        let markdownMessage = command_list_markdown(session, config);
        await sendmarkdownMessage(ctx, session, markdownMessage, config);
      } else {
        const commandText = txtCommandList.join('\n');
        await session.send(h.text(session.text(`commands.${emojihub_bili_codecommand}.messages.List_of_emojis`, [`\n${commandText}`])));
      }
    });

  ctx.on('ready', () => {
    config.MoreEmojiHubList.forEach(({ command, source_url }) => {
      ctx.command(`${config.emojihub_bili_command}/${command} [local_picture_name...]`)
        .example(`${command} 关键词1 关键词2 关键词3`)
        .option('numpics', `-${config.optionsname} <numpics:number> 指定返回数量`)
        .action(async ({ session, options }, ...local_picture_name) => {
          if (options?.numpics) {
            await sendMultipleEmojis(session, `${command} ${local_picture_name.join(' ')}`.trim(), options.numpics);
            return;
          }
          const imageResult = await determineImagePath(source_url, config, session.channelId, command, ctx, local_picture_name);

          if (!imageResult.imageUrl) {
            await session.send(h.text(session.text(`commands.${emojihub_bili_codecommand}.messages.notfound_txt`, [command])));
            return;
          }

          // 根据 config.repeatCommandDifferentiation 的值选择合适的 ID
          const identifier = config.repeatCommandDifferentiation === 'userId' ? session.userId : session.channelId;
          updateLastCommand(identifier, command);

          try {
            let message;
            if ((session.platform === "qq" || session.platform === "qqguild") && (config.markdown_button_mode === "markdown" || config.markdown_button_mode === "raw" || config.markdown_button_mode === "markdown_raw_json")) {
              if (imageResult.isLocal) {
                if (config.localPicToBase64) {
                  let imagebase64 = await getImageAsBase64(imageResult.imageUrl);
                  let MDimagebase64 = 'data:image/png;base64,' + imagebase64;
                  message = await markdown(ctx, session, command, MDimagebase64, config);
                  await sendmarkdownMessage(ctx, session, message, config);
                } else if ((session.platform === "qq" || session.platform === "qqguild") && config.QQPicToChannelUrl) {
                  const localfilepath = url.pathToFileURL(imageResult.imageUrl).href
                  let imagebase64 = await getImageAsBase64(imageResult.imageUrl);
                  let MDimagebase64 = 'data:image/png;base64,' + imagebase64;
                  const uploadedImageURL = await uploadImageToChannel(ctx, config.consoleinfo, localfilepath, session.bot.config.id, session.bot.config.secret, config.QQchannelId);
                  message = await markdown(ctx, session, command, uploadedImageURL.url, config, MDimagebase64);
                  await sendmarkdownMessage(ctx, session, message, config);
                } else {
                  const imageUrl = url.pathToFileURL(imageResult.imageUrl).href;
                  message = await markdown(ctx, session, command, imageUrl, config);
                  await sendmarkdownMessage(ctx, session, message, config);
                }
              } else {
                message = await markdown(ctx, session, command, imageResult.imageUrl, config);
                await sendmarkdownMessage(ctx, session, message, config);
              }
            } else {
              if (imageResult.isLocal && config.localPicToBase64) {// 本地图片 + base64发出
                const format = config.localPictureToName;
                logInfo(config, imageResult.imageUrl)
                // 格式化文件大小
                const fileSizeKB = (imageResult.imageSize / 1024).toFixed(2);
                const fileSizeMB = (imageResult.imageSize / (1024 * 1024)).toFixed(2);
                const formattedSize = imageResult.imageSize < 1024 * 1024 ? `${fileSizeKB} KB` : `${fileSizeMB} MB`;
                // 格式化时间
                const formattedTime = imageResult.imageTime.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\//g, '-');

                let imagebase64 = await getImageAsBase64(imageResult.imageUrl);
                const context = {
                  IMAGE: h('image', { url: 'data:image/png;base64,' + imagebase64 }),
                  NAME: imageResult.imageName,
                  TIME: formattedTime,
                  SIZE: formattedSize,
                  PATH: imageResult.imagePath,
                };
                const messageContent = replacePlaceholders(format, context);
                logInfo(config, "变量替换本地文件名称，messageContent： base64太长了不打印了")
                try {
                  message = await session.send(h.unescape(`${messageContent}`.replace(/\\n/g, '\n')));
                } catch (error) {
                  ctx.logger.error("发送本地图片失败：", error)
                }
              } else if (imageResult.isLocal) {// 本地图片 + 绝对路径
                const format = config.localPictureToName;
                logInfo(config, imageResult.imageUrl)
                // 格式化文件大小
                const fileSizeKB = (imageResult.imageSize / 1024).toFixed(2);
                const fileSizeMB = (imageResult.imageSize / (1024 * 1024)).toFixed(2);
                const formattedSize = imageResult.imageSize < 1024 * 1024 ? `${fileSizeKB} KB` : `${fileSizeMB} MB`;
                // 格式化时间
                const formattedTime = imageResult.imageTime.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\//g, '-');

                const context = {
                  IMAGE: h.image(imageResult.imageUrl),
                  NAME: imageResult.imageName,
                  TIME: formattedTime,
                  SIZE: formattedSize,
                  PATH: imageResult.imagePath,
                };
                const messageContent = replacePlaceholders(format, context);
                logInfo(config, "变量替换本地文件名称，messageContent：")
                logInfo(config, messageContent)
                try {
                  message = await session.send(h.unescape(`${messageContent}`.replace(/\\n/g, '\n')));
                } catch (error) {
                  ctx.logger.error("发送本地图片失败：", error)
                }

              } else { // 网络图片
                try {
                  message = await session.send(h.image(imageResult.imageUrl));
                } catch (error) {
                  ctx.logger.error("发送网络图片失败：", error)
                }
              }

              if ((session.platform === "qq" || session.platform === "qqguild") && config.markdown_button_mode === "json") {
                const keyboardId = config.nested.json_button_template_id;
                let markdownMessage = {
                  msg_id: session.messageId,
                  msg_type: 2,
                  content: "",
                  keyboard: {
                    id: keyboardId,
                  },
                };
                logInfo(config, markdownMessage);
                await sendmarkdownMessage(ctx, session, markdownMessage, config);
              }
            }

            if (config.deleteMsg) {
              ctx.setTimeout(async () => {
                try {
                  await session.bot.deleteMessage(session.channelId, message);
                } catch (error) {
                  logError(`撤回消息失败: ${error}`);
                  logError(error);
                }
              }, config.deleteMsgtime * 1000);
            }
          } catch (error) {
            logError(`Error sending image:  ${error}`);
            logError(error)
          }
        });
    })
  });

  ctx.command(`${config.emojihub_bili_command}/${config.emojihub_onemore}`)
    .action(async ({ session, options }) => {
      const identifier = config.repeatCommandDifferentiation === 'userId' ? session.userId : session.channelId;
      const lastCommand = lastCommandByChannel[identifier];

      logInfo(config, '尝试在区分ID ' + identifier + ' 中执行最后一个命令： ' + lastCommand);
      if (lastCommand) {
        await session.execute(`${lastCommand}`);
      } else {
        await session.send(session.text(".nocommand"));
      }
    });

  ctx.command(`${config.emojihub_bili_command}/${config.emojihub_randompic}`)
    .action(async ({ session, options }) => {

      const randomEmojiHubCommand = getRandomEmojiHubCommand(config);
      if (randomEmojiHubCommand) {
        await session.execute(randomEmojiHubCommand);
        logInfoformat(config, session.channelId, randomEmojiHubCommand, config.emojihub_randompic);
        return;
      } else {
        await session.send(session.text(".noemoji"));
      }
    });

  if (config.autoEmoji === "定量消息发送" && (config.groupListmapping.length || config.allgroupautoEmoji)) {
    const groups = {};
    // 初始化特定群组的配置
    config.groupListmapping.forEach(({ groupList, defaultemojicommand, count, enable }) => {
      if (enable === true) {
        // 如果enable为true，则将该群组标记为黑名单
        groups[groupList] = { blacklisted: true };
      } else {
        groups[groupList] = { emojicommand: defaultemojicommand, threshold: count };
      }
    });

    ctx.middleware(async (session, next) => {
      const channelId = session.channelId;

      // 确定当前群组是否在特定配置中并且是否被黑名单
      let groupConfig = groups[channelId];

      // 如果当前群组标记为黑名单，则直接跳过处理
      if (groupConfig && groupConfig.blacklisted) {
        return next();
      }

      // 如果当前群组没有特定配置，并且开启了全部群组自动表情包
      if (!groupConfig && config.allgroupautoEmoji) {
        // 初始化为全部群组的配置
        groupConfig = {
          count: 0,
          emojicommand: config.allgroupemojicommand,
          threshold: config.count
        };
        groups[channelId] = groupConfig; // 记录配置以供后续使用
      }

      // 如果存在配置，处理表情包逻辑
      if (groupConfig) {
        groupConfig.count = (groupConfig.count || 0) + 1; // 增加消息计数
        logInfo(config, `${channelId} ：${groupConfig.count} ：${session.content}`)
        // 达到触发条件
        if (groupConfig.count >= groupConfig.threshold) {
          const randomNumber = Math.random();
          // 触发概率判断
          if (randomNumber <= config.triggerprobability) {
            logInfo(config, `定量消息发送：概率判断：${randomNumber} <= ${config.triggerprobability} 触发表情包`) // 打印触发日志
            let emojicommands = groupConfig.emojicommand.split(/\n|,|，/).map(cmd => cmd.trim());
            const randomCommand = emojicommands[Math.floor(Math.random() * emojicommands.length)];
            logInfo(config, `随机选择的指令: ${randomCommand}`);
            const emojiConfig = config.MoreEmojiHubList.find(({ command }) => command === randomCommand);
            if (emojiConfig) {
              const imageResult = await determineImagePath(emojiConfig.source_url, config, channelId, emojiConfig.command, ctx);
              if (imageResult.imageUrl) {
                try {
                  groupConfig.count = 0; // 重置消息计数
                  let message;
                  if (imageResult.isLocal) { //本地图片
                    if (config.localPicToBase64) {
                      //本地base64发图
                      let imagebase64 = await getImageAsBase64(imageResult.imageUrl);
                      message = h('image', { url: 'data:image/png;base64,' + imagebase64 });
                    } else {
                      //正常本地文件发图
                      const imageUrl = url.pathToFileURL(imageResult.imageUrl).href;
                      message = h.image(imageUrl);
                    }
                  } else {
                    message = h.image(imageResult.imageUrl);
                  }
                  let sentMessage = await session.send(message);
                  // 如果需要撤回消息
                  if (config.deleteMsg) {
                    ctx.setTimeout(async () => {
                      try {
                        await session.bot.deleteMessage(session.channelId, sentMessage[0]);
                      } catch (error) {
                        logError(`撤回消息失败: ${error}`);
                      }
                    }, config.deleteMsgtime * 1000);
                  }
                } catch (error) {
                  logError(`发送图片错误: ${error}`);
                }
              } else {
                groupConfig.count = 0; // 图片不存在，重置计数
              }
            }
          } else {
            groupConfig.count = 0; // 没有触发表情包，重置计数
            const comparisonSymbol = randomNumber <= config.triggerprobability ? "<=" : ">"; // 根据比较结果设置比较符号
            logInfo(config, `定量消息发送：概率判断：${randomNumber} ${comparisonSymbol} ${config.triggerprobability}\n此次不发送表情包，并且重置计数。`)
          }
        }
      }
      return next();
    }, config.middleware);
  }


  ctx.on('ready', () => {
    if (config.autoEmoji === "定时发送" && config.groupListmapping.length && ctx.cron) {
      // const bot = ctx.bots[config.bot];
      const bot = Object.values(ctx.bots).find(b => b.selfId === config.botId || b.user?.id === config.botId);
      if (!bot || bot.status !== Universal.Status.ONLINE) {
        ctx.logger.error(`[定时发送] 机器人离线或未找到: ${config.botId}`);
        return;
      } else {
        ctx.logger.info(`定时成功：将由 ${config.botId} 执行`);
      }
      if (bot == null) return;

      const groups = {};
      // 初始化特定群组的配置
      config.groupListmapping.forEach(({ groupList, defaultemojicommand, cronTime, enable }) => {
        if (enable === true) {
          // 如果enable为true，则将该群组标记为黑名单
          groups[groupList] = { blacklisted: true };
        } else {
          groups[groupList] = { emojicommand: defaultemojicommand, cronTime };
        }
      });

      // 定时触发表情包
      for (const channelId in groups) {
        const groupConfig = groups[channelId];

        // 如果当前群组标记为黑名单，则跳过处理
        if (groupConfig && groupConfig.blacklisted) {
          continue;
        }

        // 如果当前群组没有特定配置，则跳过
        if (!groupConfig) {
          continue;
        }

        // 如果存在配置，设置定时任务
        if (groupConfig) {
          ctx.inject(['cron'], (ctx) => {
            ctx.cron(groupConfig.cronTime, async () => {
              const randomNumber = Math.random();
              // 触发概率判断
              if (randomNumber <= config.triggerprobability) {
                logInfo(config, `尝试向 ${channelId} 定时发送表情包中...`)
                let emojicommands = groupConfig.emojicommand.split(/\n|,|，/).map(cmd => cmd.trim());
                const randomCommand = emojicommands[Math.floor(Math.random() * emojicommands.length)];
                const emojiConfig = config.MoreEmojiHubList.find(({ command }) => command === randomCommand);
                if (emojiConfig) {
                  const imageResult = await determineImagePath(emojiConfig.source_url, config, channelId, emojiConfig.command, ctx);
                  if (imageResult.imageUrl) {
                    try {
                      let message;
                      if (imageResult.isLocal) { //本地图片
                        if (config.localPicToBase64) {
                          //本地base64发图
                          let imagebase64 = await getImageAsBase64(imageResult.imageUrl);
                          message = h('image', { url: 'data:image/png;base64,' + imagebase64 });
                        } else {
                          //正常本地文件发图
                          const imageUrl = url.pathToFileURL(imageResult.imageUrl).href;
                          message = h.image(imageUrl);
                        }
                      } else {
                        message = h.image(imageResult.imageUrl);
                      }

                      // 判断是群聊还是私聊
                      if (!channelId.includes("private")) {
                        await bot.sendMessage(channelId, message);
                      } else {
                        const userId = channelId.replace("private:", "");
                        await bot.sendPrivateMessage(userId, message);
                      }

                      // 如果需要撤回消息
                      if (config.deleteMsg) {
                        ctx.setTimeout(async () => {
                          try {
                            await bot.deleteMessage(channelId, message);
                          } catch (error) {
                            logError(`撤回消息失败: ${error}`);
                          }
                        }, config.deleteMsgtime * 1000);
                      }
                    } catch (error) {
                      logError(`发送图片错误: ${error}`);
                    }
                  }
                }
              } else {
                const comparisonSymbol = randomNumber <= config.triggerprobability ? "<=" : ">"; // 根据比较结果设置比较符号
                logInfo(config, `定时发送：概率判断结果：${randomNumber} ${comparisonSymbol} ${config.triggerprobability}\n此次不发送表情包。`)
              }
            });
          })
        }
      }
    } else if (config.autoEmoji === "定时发送" && config.groupListmapping.length && !ctx.cron) {
      ctx.logger.error("cron 服务加载失败！")
    }
  })
}