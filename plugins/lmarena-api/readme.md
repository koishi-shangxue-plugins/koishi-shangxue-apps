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
