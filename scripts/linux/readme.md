# Koinix - Koishi Manager for Linux

这是一个用于在 Linux 服务器上部署和管理 Koishi 实例的脚本工具。

通过 Koinix，你可以自动化安装 Koishi 运行所需依赖，并轻松创建、启动、停止和管理多个 Koishi 实例。

## 快速开始

> 普通用户 使用以下命令下载并运行 Koinix：

```bash
bash -c "$(curl -L https://raw.githubusercontent.com/koishi-shangxue-plugins/koishi-shangxue-apps/main/scripts/linux/koinixTUI.sh)"
```

> root用户 使用以下命令下载并运行 Koinix：

```bash
bash -c "$(curl -L https://raw.githubusercontent.com/koishi-shangxue-plugins/koishi-shangxue-apps/main/scripts/linux/koinixTUI-root.sh)"
```


---

## 前提条件

-   一台运行主流 Linux 发行版服务器。
-   具有 `sudo` 权限的用户。
-   稳定、良好的网络连接。

---

## 安装步骤

1.  **下载 Koinix**

    ```bash
    curl -L https://raw.githubusercontent.com/koishi-shangxue-plugins/koishi-shangxue-apps/main/scripts/linux/koinixTUI.sh -o koinix.sh
    chmod +x koinix.sh
    ```

2.  **运行 Koinix**

    ```bash
    ./koinix.sh
    ```

3.  **按照脚本提示操作**

    Koinix 会引导你完成以下步骤：

    -   安装必要的依赖（Node.js, npm/yarn, 等）。
    -   创建 Koishi 实例。
    -   启动 Koishi 服务。

---

## 主要功能

-   **自动化依赖安装**：自动检测系统并安装 Koishi 运行所需的依赖。
-   **Koishi 实例管理**：
    -   创建新的 Koishi 实例。
    -   启动、停止、重启 Koishi 实例。
    -   查看 Koishi 实例日志。
    -   删除 Koishi 实例。
-   **多实例支持**：轻松管理多个 Koishi 实例。

---

Koishi 实例默认存储在 `/root/` 目录下创建的`koishi`文件夹里，即`/root/koishi/`。如 
```
ubuntu64@ubuntu64-virtual-machine:~/koishi$
```

每个实例都可以有一个独立的子目录（创建koishi时命名），例如
```
ubuntu64@ubuntu64-virtual-machine:~/koishiS ls
koishi-app

ubuntu64@ubuntu64-virtual-machine:~/koishis cd koishi-app

ubuntu64@ubuntu64-virtual-machine:~/koishi/koishi-app$ ls
data koishi.yml node_modules README.md tsconfig.json yarn.lock
docker locales package.json tsconfig.base.json yakumo.yml

ubuntu64@ubuntu64-virtual-machine:~/koishi/koisht-app$
```

---

## 许可证

本项目使用 MIT 许可证。
