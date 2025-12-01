// ==UserScript==
// @name         ModelScope Studio Data Exporter
// @namespace    https://github.com/shangxueink
// @version      3.1
// @description  For ModelScope's Bert-VITS2 studio pages, it adds a button to download speaker data as a JSON file for plugins.
// @author       shangxueink
// @license      MIT
// @match        https://www.modelscope.cn/studios/*/*
// @icon         https://g.alicdn.com/sail-web/maas/2.9.96/favicon/128.ico
// @supportURL   https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/issues
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      *.ms.show
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // --- Activation Check ---
  const currentUrl = window.location.href.toLowerCase();
  if (!currentUrl.includes("bert") || !currentUrl.includes("vits")) {
    return;
  }

  // --- Main Logic ---
  createFloatingButton();

  function createFloatingButton() {
    const downloadBtn = document.createElement("button");
    downloadBtn.id = "download-json-btn-floating";
    downloadBtn.textContent = "下载数据JSON";

    Object.assign(downloadBtn.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: "9999",
      backgroundColor: "#ffc107",
      color: "#000",
      border: "1px solid #dee2e6",
      borderRadius: "0.5rem",
      padding: "10px 20px",
      cursor: "pointer",
      boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
    });

    downloadBtn.onclick = handleDownload;

    document.body.appendChild(downloadBtn);
    console.log("ModelScope导出器：已注入浮动下载按钮。");
  }

  async function getConfigAndRoot() {
    const pathParts = window.location.pathname.split("/");
    const author = pathParts[2];
    const modelName = pathParts[3];

    if (!author || !modelName) {
      throw new Error(
        `无法从URL(${window.location.pathname})中解析作者或模型名称。`
      );
    }

    const gradioHost = `${author.toLowerCase()}-${modelName
      .toLowerCase()
      .replace(/\./g, "-")}.ms.show`;
    const rootUrl = `https://${gradioHost}`;
    const configUrl = `${rootUrl}/config`;

    console.log(
      `ModelScope导出器：已构建预测URL。正在从以下地址获取配置: ${configUrl}`
    );

    const response = await fetch(configUrl);
    if (!response.ok) {
      throw new Error(
        `无法从预测的URL(${configUrl})获取配置: ${response.statusText}`
      );
    }
    const configData = await response.json();

    return { configData, rootUrl };
  }

  async function handleDownload() {
    try {
      // 移除了“开始获取数据”的提示
      const { configData, rootUrl } = await getConfigAndRoot();

      const apiPrefix = configData.api_prefix || "";
      const infoUrl = `${rootUrl}${apiPrefix}/info`;
      console.log(`ModelScope导出器：已动态构建info URL: ${infoUrl}`);

      const infoResponse = await fetch(infoUrl);
      if (!infoResponse.ok)
        throw new Error(`获取 info URL 失败: ${infoResponse.statusText}`);
      const infoData = await infoResponse.json();

      const generatedJson = processGradioData(configData, infoData);

      const blob = new Blob([JSON.stringify(generatedJson, null, 4)], {
        type: "application/json",
      });
      const downloadUrl = URL.createObjectURL(blob);

      const pathParts = window.location.pathname.split("/");
      const author = pathParts[2] || "unknown_author";
      const modelName = pathParts[3] || "unknown_model";

      const aiNameElement = document.querySelector(".text_Generation_name");
      const aiName = aiNameElement
        ? aiNameElement.textContent.trim()
        : "unknown_ai";
      const filename = `speakers_${aiName}_${author}_${modelName}.json`;

      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      alert(`数据已成功生成并开始下载！\n文件名: ${filename}`);
    } catch (error) {
      console.error("ModelScope导出器：生成JSON失败:", error);
      alert(`生成JSON失败: ${error.message}`);
    }
  }

  function processGradioData(config, info) {
    const pathParts = window.location.pathname.split("/");
    const author = pathParts[2] || "unknown_author";
    const modelName = pathParts[3] || "unknown_model";

    let speakerDropdown = config.components.find(
      (c) => c.props.label === "角色" && c.type === "dropdown"
    );
    if (!speakerDropdown) {
      speakerDropdown = config.components.find(
        (c) => c.props.label === "Speaker" && c.type === "dropdown"
      );
    }

    if (!speakerDropdown) {
      throw new Error("无法在配置中找到“角色”或“Speaker”下拉列表组件。");
    }

    const speakers = {};
    const speakerNames = speakerDropdown.props.choices.map((choice) => {
      return Array.isArray(choice) ? choice[0] : choice;
    });

    speakerNames.forEach((name) => {
      speakers[name] = {
        speaker: name,
      };
    });

    const baseApiUrl = `https://www.modelscope.cn/api/v1/studio/${author}/${modelName}/gradio`;
    const finalJson = {
      api: `${baseApiUrl}/run/predict`,
      fileApi: `${baseApiUrl}/file=`,
      speakers: speakers,
    };

    return finalJson;
  }
})();
