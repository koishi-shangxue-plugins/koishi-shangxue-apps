# <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Smilies/Blue%20Heart.png" alt="Blue Heart" width="35" height="35" /> koishi-shangxue-apps

## 项目简介📚

欢迎来到 `koishi-shangxue-apps` 项目仓库！ ✨

这里集合了我在 Koishi 上独立开发的各种插件，旨在增强和扩展 Koishi 的功能。

**如何找到你需要的插件？**

本仓库的 `plugins` 文件夹下包含了所有插件。每个插件都有独立的文件夹，以插件名称命名。  

请浏览 `plugins` 文件夹，找到你感兴趣的插件，并查阅其 `readme.md` 文件以获取详细的使用说明和配置信息。


例如，`emojihub-bili` 插件的说明文档位于： [plugins/emojihub-bili/readme.md](plugins/emojihub-bili/readme.md)

**重要提示：**

-   由于代码上传可能存在延迟，npm 上的版本可能更新。如果发现仓库代码与 npm 版本不一致，请以 npm 平台发布的版本为准。
-   发现 Bug 或有任何问题？ 欢迎[提交 Issue](https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/issues/new/choose)！
-   如果你发现本项目的提交（commit）长时间未更新，这意味着作者暂停了本项目的更新，并且不再维护。请自行判断项目的使用情况。
-   部分插件的 `package.json` 内名称包含 `@shangxueink` 的插件是我的私用插件，我不会接受关于这些插件的功能增改请求，仅接受 issue 反馈 bug。

---

## 开发者指南 🛠️

### 如何在项目模板中开发此仓库

1.  **创建项目模板** 🚀

    ```shell
    yarn create koishi
    ```

    一路回车，直到弹出 Koishi 的 WebUI。

2.  **进入项目模板根目录** 📂

    先在 Koishi 终端按下 `Ctrl + C` 退出项目模板，然后 `cd` 进入目录：

    ```shell
    cd koishi-app
    ```

3.  **克隆本仓库** ⬇️

    ```shell
    yarn clone koishi-shangxue-plugins/koishi-shangxue-apps
    ```

4.  **以开发模式启动** 🚧
    
    ```shell
    yarn dev
    ```

### 插件语言说明

<img src="https://raw.githubusercontent.com/MikeCodesDotNET/ColoredBadges/master/svg/dev/languages/js.svg" alt="js" style="max-width: 50%;">

本项目中，部分插件直接使用 JavaScript 编写，而非 TypeScript 编译。同时，也有部分插件使用 TypeScript 开发。

🔄 两者都支持 HMR 热重载，但在进行二次开发时，请根据插件的编写语言进行区分。

### 发布 npm 包 📦

本项目的贡献者可以在 `.publish/npmpublish` 目录下放置需要发布的 npm 包。

发布时，请确保将所有相关文件放在该目录中。

**目录结构**

```shell
publish/
├── npmpublish/
│   ├── lib
│   ├── dist
│   ├── LICENSE.txt # 已经存在，无需上传
│   ├── package.json
│   ├── readme.md
│   └── ...  # 上传其他需要发布的文件
└── npmpublish_temp/
    └── LICENSE.txt # 模板文件，请勿改动
```

在 `npmpublish` 目录下，确保包含 `package.json` 和其他相关文件，以便顺利发布 npm 包。

具体实现效果 [请参见 .github 文件](.github/workflows/publish.yml)

**本地发布 (可选)**

如果遇到资源文件过大等不方便上传发布的情况，可以在本地使用以下命令发布：

```
npm publish --registry=https://registry.npmjs.org/ --access=public
```

---

## 许可证 📜

本项目采用 MIT 许可证，详情请参见 [LICENSE](./LICENSE) 文件。
