# koishi-plugin-lmarena-api

[![npm](https://img.shields.io/npm/v/koishi-plugin-lmarena-api?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-lmarena-api)

相关地址：

- <https://github.com/shskjw/astrbot_plugin_shoubanhua/blob/master/_conf_schema.json>
- <https://github.com/HydroGest/lmarena>
- <https://moyuu.cc/keys>
- <https://platform.agnes-ai.com/settings/apiKeys>
- <https://docs-model.skyengine.com.cn/api-reference/examples/images/openai-image>

## 使用示例

```text
// 直接文生图
imagen -d 生成一个哆啦A梦

// 图生图
imagen 把下面图片里的文字删掉 [图片]

// 返回多张
imagen -n 2 把下面图片里的文字删掉 [图片] [图片]
```

## Agnes 视频生成

在“Agnes站点设置-视频”中开启“是否注册这个站点的视频功能”后，会注册独立指令【Agent视频生成】。

```text
// 文生视频
Agent视频生成 -d 一只猫在夕阳下的海边散步

// 指定目标时长（自动按当前模型可用档位取整）
Agent视频生成 -d -s 30 一只猫在夕阳下的海边散步

// 图生视频
Agent视频生成 让角色慢慢转头看向镜头 [图片]
```

## SenseNova 配置示例

以 `https://token.sensenova.cn/v1` 为例：

```yaml
apiUrl: https://token.sensenova.cn/v1
apiKey: 你的APIKey
```

`apiParams_generations` 点击右侧的“编辑JSON”，粘贴：

```json
{
  "model": "sensenova-u1.5-lite",
  "prompt": "{{prompt}}",
  "size": "auto",
  "n": "1",
  "output_format": "png",
  "response_format": "b64_json",
  "watermark": "false",
  "prompt_extend": "false"
}
```

`apiParams_edits` 点击右侧的“编辑JSON”，粘贴：

```json
{
  "model": "sensenova-u1.5-lite",
  "images": "{{inputimage}}",
  "prompt": "{{prompt}}",
  "size": "auto",
  "n": "1",
  "response_format": "b64_json",
  "watermark": "false",
  "prompt_extend": "false"
}
```

注意 SenseNova 的 `n` 仅支持 1，`size` 自定义宽高需要是 32 的倍数。

`size` 填写 `auto` 或 `{{dynamic_size}}` 时，两者完全等价，都表示“自动尺寸”：插件不会把 `auto` 原样发给接口，而是先按下面的优先级算出明确尺寸再发请求：

1. 提示词里写明的像素尺寸，例如 `尺寸 1024x1792`，原样透传
2. 提示词里写明的画面比例，例如 `画面比例9:16`，换算成同方向的标准档位（竖版 `1024x1536`、横版 `1536x1024`、正方 `1024x1024`）
3. 参考图片的横竖方向（`auto` 模式下生效；配置填固定尺寸时跳过这一步）
4. 都没有时用配置里填的固定尺寸；配置为 `auto` 则回落到 `1024x1024`

也就是说，配置写 `auto` 时提示词的优先级最高，写 `画面比例9:16` 就会返回 `1024x1536` 而不是参考图的 1:1.5。

这样做是因为 OpenAI 兼容接口的 `auto` 只按参考图比例出图，会让提示词里的画面比例失效。

> 注意：`9:16` 这类比例会被映射到接口支持的标准档位，`1024x1536` 的实际比例约为 `1:1.5`（不是严格 `0.5625`）。如果服务端支持任意尺寸，直接在提示词里写像素尺寸（如 `1024x1792`）即可原样透传。
