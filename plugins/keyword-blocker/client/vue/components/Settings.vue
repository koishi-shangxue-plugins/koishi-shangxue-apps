<template>
  <div class="settings">
    <!-- 指令过滤设置 -->
    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>指令过滤设置</span>
        </div>
      </template>
      <el-form label-width="200px">
        <el-form-item label="回复权限提示">
          <el-switch v-model="localConfig.replyNoPermission" />
          <div class="form-item-hint">
            开启：用户触发被屏蔽的指令时回复"你没有权限使用此指令"<br>
            关闭：静默拦截，不回复任何消息
          </div>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 说明信息 -->
    <el-alert title="配置说明" type="info" :closable="false" style="margin-top: 20px">
      <ul style="margin: 0; padding-left: 20px;">
        <li>中间件重新注册间隔和调试模式请在 Koishi 配置项中设置</li>
        <li>所有过滤规则配置都保存在本地文件中</li>
        <li>修改配置后请点击右上角"保存所有更改"按钮</li>
      </ul>
    </el-alert>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WebUIConfig } from '../../utils/api'

const props = defineProps<{
  modelValue: WebUIConfig
}>()

const emit = defineEmits<{
  'update:modelValue': [value: WebUIConfig]
}>()

const localConfig = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})
</script>

<style scoped lang="scss">
.settings {
  max-width: 900px;

  .settings-card {
    margin-bottom: 20px;

    .card-header {
      font-size: 16px;
      font-weight: 600;
    }

    .form-item-hint {
      font-size: 13px;
      color: var(--fg1);
      margin-top: 8px;
      line-height: 1.5;
    }
  }
}
</style>
