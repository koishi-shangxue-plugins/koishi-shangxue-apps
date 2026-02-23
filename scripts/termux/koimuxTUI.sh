#!/bin/bash

# 初始化：切换到 HOME 目录
cd "$HOME" || exit 1

# 自动注册快捷指令
register_shortcut() {
    local shell_rc=""
    if [ -f "$HOME/.bashrc" ]; then
        shell_rc="$HOME/.bashrc"
    elif [ -f "$HOME/.zshrc" ]; then
        shell_rc="$HOME/.zshrc"
    else
        shell_rc="$HOME/.bashrc"
    fi

    if ! grep -q "alias koimux=" "$shell_rc" 2>/dev/null; then
        echo 'alias koimux="bash -c \"\$(curl -L https://gitee.com/initencunter/koimux_bot/raw/master/script/koimuxTUI.sh)\""' >> "$shell_rc"
        clear
        echo "=========================================="
        echo "快捷指令 'koimux' 已注册！"
        echo "请执行以下命令使其生效："
        echo "  source $shell_rc"
        echo "或重启终端"
        echo "=========================================="
        read -n 1 -s -r -p "按任意键继续..."
        echo
    fi
}

# 检查并安装 dialog 工具
if ! command -v dialog &> /dev/null; then
    pkg install dialog -y
fi

# 默认实例目录
KOISHI_BASE_DIR="$HOME/koishi"

# 首次运行时注册快捷指令
if [ ! -f "$HOME/.koimux_registered" ]; then
    register_shortcut
    touch "$HOME/.koimux_registered"
fi

# 日志函数
log() {
    local message="$1"
    echo "$(date +'%Y-%m-%d %H:%M:%S') - $message" >> "$KOISHI_BASE_DIR/koishi-manager.log"
}

# 获取 Koishi 实例列表
function get_koishi_instances {
    find "$KOISHI_BASE_DIR" -maxdepth 2 -name "koishi.yml" -print0 | while IFS= read -r -d $'\0' file; do
        dir=$(dirname "$file")
        instance_name=$(basename "$dir")
        echo "$instance_name"
    done
}

# 选择 Koishi 实例
function select_koishi_instance {
    local instances
    instances=$(get_koishi_instances)

    if [ -z "$instances" ]; then
        dialog --msgbox "未找到 Koishi 实例！" 6 50
        return 1
    fi

    local options=()
    while IFS= read -r instance; do
        options+=("$instance" "$instance")
    done <<< "$instances"

    selected_instance=$(dialog --clear --backtitle "Koishi Manager" \
                                --title "选择 Koishi 实例" \
                                --menu "请选择一个 Koishi 实例：" 18 60 10 \
                                "${options[@]}" \
                                3>&1 1>&2 2>&3)

    if [ -z "$selected_instance" ]; then
        return 1 # 用户取消选择
    fi

    KOISHI_APP_DIR="$KOISHI_BASE_DIR/$selected_instance"
    echo "$KOISHI_APP_DIR"
}

# 确认操作函数
function confirm_return {
    echo "--------------------------------------------------"
    read -n 1 -s -r -p "执行完成。按 任意 键返回主菜单...如果有任何报错：请 立即 现在 截图 完整 日志！！！"
    echo
    read -n 1 -s -r -p "再按 任意 键返回主菜单..."
    echo
    echo
}

# 快速关闭 auth 插件
disable_auth_plugin() {
    if ! KOISHI_APP_DIR=$(select_koishi_instance); then
        return
    fi

    local config_file="$KOISHI_APP_DIR/koishi.yml"
    if [ ! -f "$config_file" ]; then
        dialog --msgbox "未找到 koishi.yml 文件！" 6 50
        return
    fi

    # 匹配格式为 "    auth:随机字符:" 的行，在前面添加波浪线
    if sed -i 's/^\(    \)auth:\([a-z0-9]\+\):$/\1~auth:\2:/' "$config_file" 2>/dev/null; then
        dialog --msgbox "auth 插件已关闭！\n请重启 Koishi 实例生效。" 7 50
    else
        dialog --msgbox "关闭 auth 插件失败！" 6 50
    fi
}

# 运行命令并展示输出 (切换到终端)
run_command() {
    local cmd="$1"
    local dir="$2"
    local title="$3"

    if [ -n "$dir" ]; then
        cd "$dir" || { dialog --msgbox "无法进入目录: $dir" 6 50; return 1; }
    fi

    # 清屏并显示提示信息
    clear
    echo "正在执行: $title"
    echo "目录: $dir"
    echo "命令: $cmd"
    echo "--------------------------------------------------"

    # 执行命令并输出到终端
    eval "$cmd"

    # 等待用户输入两次任意键
    confirm_return

    return $?
}

# 安装依赖函数
function install_dependencies {
    while true; do
        choice=$(dialog --clear --backtitle "Koishi Manager" \
                        --title "安装依赖" \
                        --menu "请选择要安装的依赖：" 18 60 10 \
                        1 "安装 x11-repo" \
                        2 "安装 tur-repo" \
                        3 "安装 libexpat" \
                        4 "安装 chromium" \
                        5 "安装 ffmpeg" \
                        6 "安装 nodejs" \
                        7 "返回主菜单" \
                        3>&1 1>&2 2>&3)

        case $choice in
            1)
                clear
                echo "正在安装 x11-repo，请稍候..."
                pkg i x11-repo -y
                confirm_return
                ;;
            2)
                clear
                echo "正在安装 tur-repo，请稍候..."
                pkg rei tur-repo -y
                confirm_return
                ;;
            3)
                clear
                echo "正在安装 libexpat，请稍候..."
                pkg rei libexpat -y
                confirm_return
                ;;
            4)
                clear
                echo "正在安装 chromium，请稍候..."
                pkg i chromium -y
                confirm_return
                ;;
            5)
                clear
                echo "正在安装 ffmpeg，请稍候..."
                pkg i ffmpeg -y
                confirm_return
                ;;
            6)
                clear
                echo "正在安装 nodejs，请稍候..."
                pkg i nodejs -y

                # 设置 npm 镜像
                echo "设置 npm 镜像源..."
                npm config set registry https://registry.npmmirror.com

                # 查看 npm 镜像
                echo "当前 npm 镜像源："
                npm config get registry

                confirm_return
                ;;
            7)
                break
                ;;
            *)
                break
                ;;
        esac
    done
}

# 创建 Koishi 实例
function create_koishi_instance {
    mkdir -p "$KOISHI_BASE_DIR"

    # 确认创建
    if ! dialog --clear --backtitle "Koishi Manager" \
                --title "创建 Koishi 实例" \
                --yesno "确定要创建新的 Koishi 实例吗？" 7 50; then
      return
    fi

    cd "$KOISHI_BASE_DIR" || return

    # 退出 UI，将控制权交给终端
    clear
    echo "正在创建 Koishi 实例，请按照提示进行操作..."

    npm init koishi@latest

    # 退出脚本，不再返回 UI
    exit 0
}

# 删除 Koishi 实例
function delete_koishi_instance {
    if ! KOISHI_APP_DIR=$(select_koishi_instance); then
        return
    fi

    if dialog --clear --backtitle "Koishi Manager" \
              --title "删除 Koishi 实例"\
              --yesno "确定要删除 "$KOISHI_APP_DIR" 实例吗？此操作不可恢复！" 7 50; then
        rm -rf "$KOISHI_APP_DIR"
        dialog --msgbox "Koishi 实例已删除！" 6 50
        main_menu # 删除后返回主菜单
    fi
}

# Koishi 控制菜单
function koishi_control {
    if ! KOISHI_APP_DIR=$(select_koishi_instance); then
        return
    fi

    while true; do
        choice=$(dialog --clear --backtitle "Koishi Manager" \
                        --title "Koishi 控制" \
                        --menu "请选择一个操作：" 18 60 10 \
                        1 "启动 Koishi (npm start)" \
                        2 "整理依赖 (npm install)" \
                        3 "重装依赖 (rm -rf node_modules && npm install)" \
                        4 "升级全部依赖 (npm update)" \
                        5 "以开发模式启动 (npm run dev)" \
                        6 "编译全部源码 (npm run build)" \
                        7 "依赖去重 (npm dedupe)" \
                        8 "关闭 auth 插件" \
                        9 "删除 Koishi 实例" \
                        0 "返回主菜单" \
                        3>&1 1>&2 2>&3)

        case $choice in
            1)
                run_command "npm start" "$KOISHI_APP_DIR" "启动 Koishi"
                ;;
            2)
                run_command "npm install" "$KOISHI_APP_DIR" "整理依赖"
                ;;
            3)
                run_command "rm -rf node_modules && npm install" "$KOISHI_APP_DIR" "重装依赖"
                ;;
            4)
                run_command "npm update" "$KOISHI_APP_DIR" "升级全部依赖"
                ;;
            5)
                run_command "npm run dev" "$KOISHI_APP_DIR" "开发模式启动"
                ;;
            6)
                run_command "npm run build" "$KOISHI_APP_DIR" "编译全部源码"
                ;;
            7)
                run_command "npm dedupe" "$KOISHI_APP_DIR" "依赖去重"
                ;;
            8)
                disable_auth_plugin
                ;;
            9)
                delete_koishi_instance
                return # 删除后返回主菜单, 避免继续循环
                ;;
            0)
                break
                ;;
            *)
               break
                ;;
        esac
    done
}

# 主菜单
function main_menu {
    while true; do
        choice=$(dialog --clear --backtitle "Koishi Manager" \
                        --title "主菜单" \
                        --menu "请选择一个操作：" 18 60 10 \
                        1 "安装依赖" \
                        2 "创建 Koishi 实例" \
                        3 "管理 Koishi 实例" \
                        4 "退出" \
                        3>&1 1>&2 2>&3)

        case $choice in
            1)
                install_dependencies
                ;;
            2)
                create_koishi_instance
                ;;
            3)
                koishi_control
                ;;
            4)
                if dialog --clear --backtitle "Koishi Manager" \
                          --title "退出" \
                          --yesno "确定要退出吗？" 7 50; then
                    exit 0
                fi
                ;;
            "")  # 处理直接按 Enter 或 Esc 的情况 (Cancell)
                if dialog --clear --backtitle "Koishi Manager" \
                          --title "退出" \
                          --yesno "确定要退出吗？" 7 50; then
                    exit 0
                fi
                ;;

            *)
                dialog --infobox "无效选项，请重新选择..." 3 30; sleep 1
                ;;
        esac
    done
}

# 启动主菜单
main_menu
