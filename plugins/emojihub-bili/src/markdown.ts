import { Context } from "koishi";
import { Config } from "./config";
import { replacePlaceholders, logInfo, logError } from "./utils";

export function command_list_markdown(session, config: Config) {
  let markdownMessage = {
    msg_id: "",
    msg_type: 2,
    markdown: {},
    keyboard: {},
  };

  if (!config.markdown_button_mode_initiative) {
    markdownMessage.msg_id = session.messageId;
  }

  if (config.markdown_button_mode === "json" && !config.markdown_button_mode_initiative) {
    if (!config.markdown_button_mode_initiative) {
      // @ts-ignore
      markdownMessage = {
        msg_id: session.messageId, // 被动消息
        msg_type: 2,
        // markdown: {}, // json情况里不允许传入这个字段，但是其他情况都有。
        keyboard: {},
      }
    } else {
      // @ts-ignore
      markdownMessage = { // 主动消息
        msg_type: 2,
        // markdown: {}, // json情况里不允许传入这个字段，但是其他情况都有。
        keyboard: {},
      }
    }
    const keyboardId = config.nestedlist.json_button_template_id;
    if (config.markdown_button_mode_keyboard) {
      markdownMessage.keyboard = {
        id: keyboardId,
      };
    }
  }
  else if (config.markdown_button_mode === "markdown") {
    const templateId = config.nestedlist.markdown_button_template_id;
    const keyboardId = config.nestedlist.markdown_button_keyboard_id;
    const contentTable = config.nestedlist.markdown_button_content_table;

    const params = contentTable.map(item => ({
      key: item.raw_parameters,
      values: replacePlaceholders(item.replace_parameters, { session, config }),
    }));

    markdownMessage.markdown = {
      custom_template_id: templateId,
      params: params,
    };
    if (config.markdown_button_mode_keyboard) {
      markdownMessage.keyboard = {
        id: keyboardId,
      };
    }

  } else if (config.markdown_button_mode === "markdown_raw_json") {
    const templateId = config.nestedlist.markdown_raw_json_button_template_id;
    const contentTable = config.nestedlist.markdown_raw_json_button_content_table;
    let keyboard = JSON.parse(config.nestedlist.markdown_raw_json_button_keyboard);

    keyboard = replacePlaceholders(keyboard, { session, config }, true);

    const params = contentTable.map(item => ({
      key: item.raw_parameters,
      values: replacePlaceholders(item.replace_parameters, { session, config }),
    }));

    markdownMessage.markdown = {
      custom_template_id: templateId,
      params: params,
    };
    if (config.markdown_button_mode_keyboard) {
      markdownMessage.keyboard = {
        content: keyboard,
      };
    }
  } else if (config.markdown_button_mode === "raw") {
    try {
      const rawMarkdownContent = config.nestedlist.raw_markdown_button_content;
      const rawMarkdownKeyboard = config.nestedlist.raw_markdown_button_keyboard;

      const replacedMarkdownContent = replacePlaceholders(rawMarkdownContent, { session, config }, true);
      const replacedMarkdownKeyboard = replacePlaceholders(rawMarkdownKeyboard, { session, config }, true)
        .replace(/^[\s\S]*?"keyboard":\s*/, '')
        .replace(/\\n/g, '')
        .replace(/\\"/g, '"')
        .trim();

      const keyboard = JSON.parse(replacedMarkdownKeyboard);

      markdownMessage.markdown = {
        // @ts-ignore
        content: replacedMarkdownContent,
      };
      if (config.markdown_button_mode_keyboard) {
        markdownMessage.keyboard = {
          content: keyboard,
        };
      }
    } catch (error) {
      logError(`解析原生 Markdown 出错: ${error}`);
      return null;
    }
  }

  logInfo(config, `Markdown 模板参数: ${JSON.stringify(markdownMessage, null, 2)}`);
  return markdownMessage;
}


export async function markdown(ctx: Context, session, command, imageUrl, config: Config, localimage?) {
  const markdownMessage = {
    msg_id: "",
    msg_type: 2,
    markdown: {},
    keyboard: {},
  };

  if (!config.markdown_button_mode_initiative) {
    markdownMessage.msg_id = session.messageId;
  }

  let originalWidth;
  let originalHeight;
  // 尝试从 URL 中解析尺寸
  const sizeMatch = imageUrl.match(/\?px=(\d+)x(\d+)$/);

  if (sizeMatch) {
    originalWidth = parseInt(sizeMatch[1], 10);
    originalHeight = parseInt(sizeMatch[2], 10);
  } else {
    const canvasimage = await ctx.canvas.loadImage(localimage || imageUrl);
    // @ts-ignore
    originalWidth = canvasimage.naturalWidth || canvasimage.width;
    // @ts-ignore
    originalHeight = canvasimage.naturalHeight || canvasimage.height;
  }

  if (config.markdown_button_mode === "markdown") {
    const templateId = config.nested.markdown_button_template_id;
    const keyboardId = config.nested.markdown_button_keyboard_id;
    const contentTable = config.nested.markdown_button_content_table;

    const params = contentTable.map(item => ({
      key: item.raw_parameters,
      values: replacePlaceholders(item.replace_parameters, { session, config, img_pxpx: `img#${originalWidth}px #${originalHeight}px`, img_url: imageUrl, command }),
    }));

    markdownMessage.markdown = {
      custom_template_id: templateId,
      params: params,
    };
    if (config.markdown_button_mode_keyboard) {
      markdownMessage.keyboard = {
        id: keyboardId,
      };
    }
  } else if (config.markdown_button_mode === "markdown_raw_json") {
    const templateId = config.nested.markdown_raw_json_button_template_id;
    const contentTable = config.nested.markdown_raw_json_button_content_table;
    let keyboard = JSON.parse(config.nested.markdown_raw_json_button_keyboard);

    keyboard = replacePlaceholders(keyboard, { session, config, img_pxpx: `img#${originalWidth}px #${originalHeight}px`, img_url: imageUrl, command }, true);

    const params = contentTable.map(item => ({
      key: item.raw_parameters,
      values: replacePlaceholders(item.replace_parameters, { session, config, img_pxpx: `img#${originalWidth}px #${originalHeight}px`, img_url: imageUrl, command }),
    }));

    markdownMessage.markdown = {
      custom_template_id: templateId,
      params: params,
    };
    if (config.markdown_button_mode_keyboard) {
      markdownMessage.keyboard = {
        content: keyboard,
      };
    }
  } else if (config.markdown_button_mode === "raw") {
    try {
      const rawMarkdownContent = config.nested.raw_markdown_button_content;
      const rawMarkdownKeyboard = config.nested.raw_markdown_button_keyboard;

      const replacedMarkdownContent = replacePlaceholders(rawMarkdownContent, { session, config, img_pxpx: `img#${originalWidth}px #${originalHeight}px`, img_url: imageUrl, command }, true);
      const replacedMarkdownKeyboard = replacePlaceholders(rawMarkdownKeyboard, { session, config, command }, true)
        .replace(/^[\s\S]*?"keyboard":\s*/, '')
        .replace(/\\n/g, '')
        .replace(/\\"/g, '"')
        .trim();

      const keyboard = JSON.parse(replacedMarkdownKeyboard);

      markdownMessage.markdown = {
        // @ts-ignore
        content: replacedMarkdownContent,
      };
      if (config.markdown_button_mode_keyboard) {
        markdownMessage.keyboard = {
          content: keyboard,
        };
      }
    } catch (error) {
      logError(`解析原生 Markdown 出错: ${error}`);
      return null;
    }
  }

  logInfo(config, `Markdown 模板参数: ${JSON.stringify(markdownMessage, null, 2)}`);
  return markdownMessage;
}

// 提取消息发送逻辑为函数
export async function sendmarkdownMessage(ctx, session, message, config?: Config) {
  if (config) logInfo(config, "正在调用sendmarkdownMessage发送md")
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