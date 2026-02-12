<template>
  <div class="settings">
    <!-- 基础配置 -->
    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>基础配置</span>
        </div>
      </template>
      <el-form label-width="200px">
        <el-form-item>
          <template #label>
            <span>中间件重新注册间隔</span>
            <el-tooltip content="越小优先级越稳定，但性能开销越大" placement="top">
              <el-icon style="margin-left: 4px">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
          </template>
          <div style="width: 100%">
            <el-slider v-model="localConfig.reregisterInterval" :min="50" :max="5000" :step="50" show-input
              :marks="marks" />
            <el-alert :title="performanceHint" type="info" :closable="false" style="margin-top: 12px" />
          </div>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 调试设置 -->
    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>调试设置</span>
        </div>
      </template>
      <el-form label-width="200px">
        <el-form-item label="记录被屏蔽的消息和指令">
          <el-switch v-model="localConfig.logBlocked" />
          <div class="form-item-hint">
            开启后在日志中记录所有被屏蔽的消息和指令
          </div>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 指令过滤设置 -->
    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>指令过滤设置</span>
        </div>
      </template>
      <el-form label-width="200px">
        <el-form-item label="回复权限提示">
          <el-switch v-model="localConfig.replyNoPermission" :disabled="!localConfig.enableCommandFilter" />
          <div class="form-item-hint">
            开启：用户触发被屏蔽的指令时回复"你没有权限使用此指令"<br>
            关闭：静默拦截，不回复任何消息
          </div>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import type { Config } from '../../utils/api'

const props = defineProps<{
  modelValue: Config
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Config]
}>()

const localConfig = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const marks = {
  50: '50ms',
  100: '100ms',
  500: '500ms',
  1000: '1s',
  5000: '5s'
}

const performanceHint = computed(() => {
  const interval = localConfig.value.reregisterInterval
  if (interval <= 100) {
    return '推荐设置：平衡性能和优先级保证'
  } else if (interval <= 500) {
    return '高性能模式：可能偶尔被其他插件抢占优先级'
  } else {
    return '极致性能模式：优先级保证较弱，但性能开销最小'
  }
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
      color: #909399;
      margin-top: 8px;
      line-height: 1.5;
    }
  }
}
</style>
