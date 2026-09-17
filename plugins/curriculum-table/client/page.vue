<template>
  <div class="ct-page" :class="{ 'is-dragging': dragActive }">
    <header class="ct-topbar">
      <div class="ct-brand">
        <span class="ct-brand-mark">课</span>
        <div>
          <strong>课程表</strong>
          <span>{{ state.schedules.length }} 份课表 · {{ state.pushes.length }} 个推送</span>
        </div>
      </div>
      <nav class="ct-tabs">
        <button :class="{ active: view === 'schedule' }" @click="view = 'schedule'">课程表编辑</button>
        <button :class="{ active: view === 'push' }" @click="view = 'push'">推送设置</button>
      </nav>
      <div class="ct-status" :class="{ error: hasError }">{{ statusText }}</div>
    </header>

    <main class="ct-main">
      <section v-if="view === 'schedule'" class="ct-schedule-layout">
        <aside class="ct-list-pane">
          <div class="ct-pane-title">
            <span>课表列表</span>
            <button class="ct-icon-button" title="新建课表" @click="newSchedule">＋</button>
          </div>
          <div class="ct-schedule-list">
            <button
              v-for="schedule in state.schedules"
              :key="schedule.id"
              :class="{ active: schedule.id === selectedScheduleId, draft: schedule.id < 0 }"
              @click="selectSchedule(schedule.id)"
            >
              <span class="ct-list-name">{{ schedule.name }}</span>
              <span>{{ schedule.channelId || '未设群组' }}</span>
              <span>{{ schedule.userId || '未设用户' }}</span>
              <small v-if="schedule.id < 0">未保存</small>
            </button>
            <div v-if="state.schedules.length === 0" class="ct-empty">暂无课表</div>
          </div>
        </aside>

        <section class="ct-editor">
          <div class="ct-meta-bar">
            <label>
              <span>课表名称</span>
              <input v-model="scheduleDraft.name" />
            </label>
            <label>
              <span>课表所属群组 ID *</span>
              <input v-model="scheduleDraft.channelId" />
            </label>
            <label>
              <span>课表所属用户 ID *</span>
              <input v-model="scheduleDraft.userId" />
            </label>
            <label>
              <span>本学期日期（开始）</span>
              <input v-model="scheduleDraft.termStartDate" type="date" />
            </label>
            <label>
              <span>本学期日期（结束）</span>
              <input v-model="scheduleDraft.termEndDate" type="date" />
            </label>
            <div class="ct-form-actions">
              <button class="primary" :disabled="busy" @click="saveSchedule">保存课表</button>
              <button v-if="scheduleDraft.id" class="danger" :disabled="busy" @click="deleteSchedule">删除</button>
            </div>
          </div>

          <div class="ct-guide">
            <span>单击或拖动选择单元格</span>
            <span>选中后直接在右侧编辑</span>
            <span>Ctrl+M 合并</span>
            <span>Delete 删除单元格</span>
            <span>Ctrl+S 保存</span>
          </div>

          <div class="ct-grid-toolbar">
            <strong>{{ selectedSchedule?.name || '课程编排' }}</strong>
            <span>{{ activeCourses.length }} 门课程</span>
            <span class="ct-active-slot">{{ selectionLabel }}</span>
            <button class="ct-small-button" title="合并选中单元格（Ctrl+M）" @click="mergeSelection">合并单元格</button>
          </div>

          <div class="ct-timetable-scroll" @wheel="handleSheetWheel">
            <div class="ct-timetable">
              <div class="ct-grid-corner">时间</div>
              <div
                v-for="day in weekdays"
                :key="day.value"
                class="ct-day-head"
                :style="dayHeadStyle(day.value)"
              >
                {{ day.label }}
              </div>

              <template v-for="slot in timeSlots" :key="slot.index">
                <div class="ct-time-label" :style="timeLabelStyle(slot.index)">
                  {{ minutesToTime(slot.startMinutes) }}
                </div>
                <button
                  v-for="day in weekdays"
                  v-show="!isCellCovered(day.value, slot.index)"
                  :key="day.value"
                  class="ct-slot"
                  :class="{ selected: isCellSelected(day.value, slot.index) }"
                  :style="slotStyle(day.value, slot.index)"
                  :data-weekday="day.value"
                  :data-slot="slot.index"
                  :aria-label="`${day.label} ${minutesToTime(slot.startMinutes)}`"
                  @pointerdown="beginSlotPress($event, day.value, slot.index)"
                  @pointerenter="handleSlotEnter(day.value, slot.index)"
                  @dblclick="createCourseAtSelection"
                  @contextmenu.prevent="openContextMenu($event)"
                ></button>
              </template>

              <button
                v-for="course in activeCourses"
                :key="course.id"
                class="ct-course"
                :class="{
                  selected: selectedCourse?.id === course.id || courseIntersectsSelection(course),
                  dragging: draggingCourseId === course.id,
                  'no-course': course.name === '无课程',
                }"
                :style="courseStyle(course)"
                @pointerdown="beginCoursePointer($event, course)"
                @dblclick.stop="editCourse(course)"
                @contextmenu.prevent="openContextMenu($event, course)"
              >
                <strong>{{ course.name }}</strong>
                <span>{{ course.startTime }}-{{ course.endTime }}</span>
                <i
                  class="ct-resize-handle"
                  title="拖动调整结束时间"
                  @pointerdown="beginResize($event, course)"
                ></i>
              </button>
            </div>
          </div>
        </section>

        <aside class="ct-inspector">
          <div class="ct-pane-title">
            <span>{{ selectedCourse ? '编辑单元格' : '单元格编辑' }}</span>
          </div>
          <template v-if="selectedCourse">
            <div class="ct-cell-form" @input="markEditorDirty" @change="markEditorDirty">
              <label>
                <span>名称</span>
                <input v-model="selectedCourse.name" list="ct-course-names" placeholder="无课程" />
              </label>
              <label>
                <span>开始时间</span>
                <input v-model="selectedCourse.startTime" type="time" step="300" />
              </label>
              <label>
                <span>结束时间</span>
                <input v-model="selectedCourse.endTime" type="time" step="300" />
              </label>
            </div>
            <div class="ct-form-actions vertical">
              <button class="primary" :disabled="busy" @click="saveCourse(selectedCourse)">保存课程</button>
              <button class="danger" :disabled="busy" @click="clearSelection">删除单元格</button>
            </div>
          </template>
          <div v-else class="ct-cell-empty">
            <strong>{{ selectionLabel }}</strong>
            <span>当前单元格没有课程</span>
          </div>
        </aside>
      </section>

      <section v-else-if="view === 'push'" class="ct-push-layout">
        <aside class="ct-list-pane">
          <div class="ct-pane-title">
            <span>推送闹钟</span>
            <button class="ct-icon-button" title="新建推送" @click="newPush">＋</button>
          </div>
          <div class="ct-push-list">
            <button
              v-for="push in state.pushes"
              :key="push.id"
              :class="{ active: push.id === pushDraft.id, draft: push.id < 0 }"
              @click="selectPush(push)"
            >
              <span class="ct-led" :class="{ on: push.id > 0 && push.enabled }"></span>
              <span class="ct-push-time">{{ push.pushTime }}</span>
              <span class="ct-list-name">{{ push.name }}</span>
              <span>{{ push.channelId || '未设群组' }}</span>
              <small v-if="push.id < 0">未保存</small>
            </button>
            <div v-if="state.pushes.length === 0" class="ct-empty">暂无推送闹钟</div>
          </div>
        </aside>

        <section class="ct-push-form">
          <div class="ct-push-form-grid">
            <label class="ct-check ct-check-first">
              <input v-model="pushDraft.enabled" type="checkbox" />
              <span>启用推送</span>
            </label>
            <label>
              <span>名称</span>
              <input v-model="pushDraft.name" />
            </label>
            <label>
              <span>推送机器人</span>
              <select v-model="pushBotSelection" @change="applyPushBot">
                <option value="__manual__">手动填写</option>
                <option v-for="bot in state.bots" :key="bot.id" :value="bot.selfId">
                  {{ bot.name }} ({{ bot.platform }})
                </option>
              </select>
            </label>
            <template v-if="pushManualBot">
              <label>
                <span>机器人 ID</span>
                <input v-model="pushDraft.botId" />
              </label>
              <label>
                <span>平台名称</span>
                <input v-model="pushDraft.platform" />
              </label>
            </template>
            <label>
              <span>推送目标群组 ID *</span>
              <input v-model="pushDraft.channelId" />
            </label>
            <label>
              <span>推送时间</span>
              <input v-model="pushDraft.pushTime" type="time" />
            </label>
            <label>
              <span>课表日期</span>
              <select v-model.number="pushDraft.dayOffset">
                <option :value="-1">前一天</option>
                <option :value="0">当天</option>
                <option :value="1">后一天</option>
              </select>
            </label>
            <label class="ct-check">
              <input v-model="pushDraft.sendWhenEmpty" type="checkbox" />
              <span>无课程也发送</span>
            </label>
          </div>

          <div class="ct-subsection">
            <div class="ct-subsection-title">
              <strong>触发星期</strong>
              <span>{{ pushDraft.weekdays.length ? `已选 ${pushDraft.weekdays.length} 天` : '每天' }}</span>
            </div>
            <div class="ct-chip-row">
              <button
                v-for="day in weekdays"
                :key="day.value"
                class="ct-chip"
                :class="{ active: pushDraft.weekdays.includes(day.value) }"
                @click="togglePushWeekday(day.value)"
              >
                {{ day.label }}
              </button>
            </div>
          </div>

          <div class="ct-subsection">
            <div class="ct-subsection-title">
              <strong>汇总课表</strong>
              <span>{{ pushDraft.scheduleIds.length ? `已选 ${pushDraft.scheduleIds.length} 份` : '全部课表' }}</span>
            </div>
            <div class="ct-schedule-options">
              <label v-for="schedule in pushScheduleOptions" :key="schedule.id">
                <input
                  type="checkbox"
                  :checked="pushDraft.scheduleIds.includes(schedule.id)"
                  @change="togglePushSchedule(schedule.id, $event)"
                />
                <span>{{ schedule.name }}</span>
                <small>{{ schedule.channelId }} / {{ schedule.userId }}</small>
              </label>
              <div v-if="pushScheduleOptions.length === 0" class="ct-empty">当前群组没有可选课表</div>
            </div>
          </div>

          <div class="ct-form-actions">
            <button class="primary" :disabled="busy" @click="savePush">保存推送</button>
            <button v-if="pushDraft.id" class="danger" :disabled="busy" @click="deletePush">删除</button>
          </div>
        </section>

        <aside class="ct-push-preview">
          <div class="ct-pane-title"><span>推送摘要</span></div>
          <div class="ct-preview-time">{{ pushDraft.pushTime || '--:--' }}</div>
          <div class="ct-preview-line">{{ pushDraft.channelId || '未设群组' }}</div>
          <div class="ct-preview-line">{{ dayOffsetLabel(pushDraft.dayOffset) }}课表</div>
          <div class="ct-preview-line">图片课程表</div>
          <div class="ct-preview-line">{{ pushDraft.enabled ? '推送已启用' : '推送已停用' }}</div>
          <div v-if="pushDraft.lastPushAt" class="ct-preview-line muted">上次：{{ pushDraft.lastPushAt }}</div>
        </aside>
      </section>

      <section v-else class="ct-empty-view">暂无内容</section>
    </main>

    <div
      v-if="contextMenu"
      class="ct-context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @pointerdown.stop
    >
      <button @click="contextEdit">编辑单元格</button>
      <button @click="contextMerge">合并单元格</button>
      <button class="danger-text" @click="contextDelete">删除单元格</button>
    </div>

    <datalist id="ct-course-names">
      <option v-for="name in courseNameOptions" :key="name" :value="name"></option>
    </datalist>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { send } from '@koishijs/client'
import type {
  CourseDraft,
  CurriculumCourseV2,
  CurriculumPushV2,
  CurriculumScheduleV2,
  CurriculumWebState,
  PushDraft,
  ScheduleDraft,
} from './types'

const rowHeight = 24
const headerHeight = 36
const MANUAL_BOT = '__manual__'
const weekdays = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' },
]
const timeSlots = Array.from({ length: 48 }, (_, index) => ({
  index,
  startMinutes: index * 30,
}))

interface CellPosition {
  weekday: number
  slotIndex: number
}

interface CellRange {
  weekdayStart: number
  weekdayEnd: number
  slotStart: number
  slotEnd: number
}

interface ContextMenuState {
  x: number
  y: number
}

const view = ref<'schedule' | 'push'>('schedule')
const state = ref<CurriculumWebState>({
  schedules: [],
  courses: [],
  pushes: [],
  bots: [],
})
const selectedScheduleId = ref<number>()
const selectedCourse = ref<CourseDraft>()
const scheduleDraft = ref<ScheduleDraft>(createScheduleDraft())
const pushDraft = ref<PushDraft>(createPushDraft())
const pushBotSelection = ref(MANUAL_BOT)
const pushManualBot = ref(true)
const selectionAnchor = ref<CellPosition>()
const selectionFocus = ref<CellPosition>()
const cellSelecting = ref(false)
const busy = ref(false)
const editorDirty = ref(false)
const statusText = ref('就绪')
const hasError = ref(false)
const dragActive = ref(false)
const draggingCourseId = ref<number>()
const contextMenu = ref<ContextMenuState>()

let tempId = -1
let slotPress:
  | {
    timer: number
    startX: number
    startY: number
  }
  | undefined
let coursePress:
  | {
    id: number
    startX: number
    startY: number
    dragging: boolean
    longPressed: boolean
    timer: number
    original: CurriculumCourseV2
  }
  | undefined
let resizeState:
  | {
    id: number
    startY: number
    endMinutes: number
  }
  | undefined

const selectedSchedule = computed(() => (
  state.value.schedules.find(schedule => schedule.id === selectedScheduleId.value)
))

const activeCourses = computed(() => (
  selectedScheduleId.value
    ? state.value.courses.filter(course => course.scheduleId === selectedScheduleId.value)
    : []
))

const courseNameOptions = computed(() => (
  [...new Set(activeCourses.value.map(course => course.name).filter(name => name && name !== '无课程'))]
))

const selectedRange = computed<CellRange | undefined>(() => (
  normalizeCellRange(selectionAnchor.value, selectionFocus.value)
))

const selectionLabel = computed(() => {
  const range = selectedRange.value
  if (!range) return '未选择单元格'
  const dayLabel = range.weekdayStart === range.weekdayEnd
    ? weekdayLabel(range.weekdayStart)
    : `${weekdayLabel(range.weekdayStart)}至${weekdayLabel(range.weekdayEnd)}`
  const start = minutesToTime(range.slotStart * 30)
  const end = minutesToTime(Math.min((range.slotEnd + 1) * 30, 23 * 60 + 59))
  return `${dayLabel} ${start}-${end}`
})

const pushScheduleOptions = computed(() => {
  return state.value.schedules.filter(schedule => schedule.id > 0)
})

onMounted(async () => {
  window.addEventListener('keydown', handleKeyboardShortcut)
  window.addEventListener('pointerdown', handleGlobalPointerDown)
  await loadState()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyboardShortcut)
  window.removeEventListener('pointerdown', handleGlobalPointerDown)
  cancelSlotPress()
  cancelCoursePress()
  stopResize(false)
})

function handleGlobalPointerDown(event: PointerEvent): void {
  const target = event.target
  if (target instanceof HTMLElement && target.closest('.ct-context-menu')) return
  closeContextMenu()
}

async function loadState(): Promise<void> {
  try {
    const temporarySchedules = state.value.schedules.filter(schedule => schedule.id < 0)
    const temporaryPushes = state.value.pushes.filter(push => push.id < 0)
    const nextState = await send('curriculum-table/state')
    state.value = {
      ...nextState,
      schedules: [...temporarySchedules, ...nextState.schedules],
      pushes: [...temporaryPushes, ...nextState.pushes],
    }
    const currentSchedule = state.value.schedules.find(schedule => (
      schedule.id === selectedScheduleId.value
    ))
    if (currentSchedule) selectSchedule(currentSchedule.id)
    else if (state.value.schedules[0]) selectSchedule(state.value.schedules[0].id)
    else newSchedule()

    const currentPush = state.value.pushes.find(push => push.id === pushDraft.value.id)
    if (currentPush) selectPush(currentPush)
    else if (state.value.pushes[0]) selectPush(state.value.pushes[0])
    else newPush()
  } catch (error) {
    setStatus(errorMessage(error), true)
  }
}

function createScheduleDraft(schedule?: CurriculumScheduleV2): ScheduleDraft {
  if (schedule) return { ...schedule }
  const { startDate, endDate } = defaultTermDates()
  return {
    name: '新课程表',
    platform: '',
    botId: '',
    guildId: '',
    channelId: '',
    userId: '',
    username: '',
    userAvatar: '',
    termStartDate: startDate,
    termEndDate: endDate,
  }
}

function createCourseDraft(scheduleId = selectedScheduleId.value || 0): CourseDraft {
  const range = selectedRange.value
  return {
    scheduleId,
    name: '',
    weekday: range?.weekdayStart || 1,
    weekdayEnd: range?.weekdayEnd || 1,
    startTime: minutesToTime(range?.slotStart !== undefined ? range.slotStart * 30 : 8 * 60),
    endTime: minutesToTime(
      range?.slotEnd !== undefined
        ? Math.min((range.slotEnd + 1) * 30, 23 * 60 + 59)
        : 9 * 60,
    ),
  }
}

function createPushDraft(): PushDraft {
  const firstBot = state.value.bots[0]
  return {
    name: '课表推送',
    platform: firstBot?.platform || '',
    botId: firstBot?.selfId || '',
    guildId: '',
    channelId: '',
    scheduleIds: [],
    weekdays: [],
    dayOffset: 0,
    pushTime: '07:30',
    sendWhenEmpty: true,
    enabled: true,
  }
}

function selectSchedule(id: number): void {
  const schedule = state.value.schedules.find(item => item.id === id)
  if (!schedule) return
  selectedScheduleId.value = id
  scheduleDraft.value = { ...schedule }
  selectedCourse.value = undefined
  setDefaultSelection()
}

function newSchedule(): void {
  const draft = createScheduleDraft()
  draft.name = uniqueName(draft.name, state.value.schedules.map(schedule => schedule.name))
  const id = nextTempId()
  const now = Date.now()
  const temporary: CurriculumScheduleV2 = {
    ...draft,
    id,
    createdAt: now,
    updatedAt: now,
  }
  state.value.schedules = [temporary, ...state.value.schedules]
  selectedScheduleId.value = id
  scheduleDraft.value = { ...draft, id }
  selectedCourse.value = undefined
  setDefaultSelection()
}

async function saveSchedule(): Promise<void> {
  if (!validateSchedule()) return
  busy.value = true
  const temporaryId = scheduleDraft.value.id
  try {
    const payload = {
      ...scheduleDraft.value,
      id: temporaryId && temporaryId > 0 ? temporaryId : undefined,
    }
    const result = await send('curriculum-table/schedule/save', payload)
    if (!result.success || !result.data) throw new Error(result.message || '保存失败')
    state.value.schedules = state.value.schedules.map(schedule => (
      schedule.id === temporaryId ? result.data : schedule
    ))
    selectedScheduleId.value = result.data.id
    scheduleDraft.value = { ...result.data }
    const index = state.value.schedules.findIndex(schedule => schedule.id === result.data?.id)
    if (index >= 0) state.value.schedules[index] = result.data
    else state.value.schedules.push(result.data)
    setStatus('课表已保存')
  } catch (error) {
    setStatus(errorMessage(error), true)
  } finally {
    busy.value = false
  }
}

async function deleteSchedule(): Promise<void> {
  const id = scheduleDraft.value.id
  if (!id || !window.confirm('确定删除这份课表及其全部课程吗？')) return
  busy.value = true
  try {
    if (id < 0) {
      state.value.schedules = state.value.schedules.filter(schedule => schedule.id !== id)
    } else {
      const result = await send('curriculum-table/schedule/delete', id)
      if (!result.success) throw new Error(result.message || '删除失败')
    }
    selectedScheduleId.value = undefined
    await loadState()
    setStatus('课表已删除')
  } catch (error) {
    setStatus(errorMessage(error), true)
  } finally {
    busy.value = false
  }
}

function dayHeadStyle(weekday: number): Record<string, string> {
  return {
    gridColumn: String(weekday + 1),
    gridRow: '1',
  }
}

function timeLabelStyle(slotIndex: number): Record<string, string> {
  return {
    gridColumn: '1',
    gridRow: String(slotIndex + 2),
  }
}

function slotStyle(weekday: number, slotIndex: number): Record<string, string> {
  return {
    gridColumn: String(weekday + 1),
    gridRow: String(slotIndex + 2),
  }
}

function beginSlotPress(event: PointerEvent, weekday: number, slotIndex: number): void {
  if (event.button !== 0) return
  flushEditor()
  cancelSlotPress()
  cellSelecting.value = true
  selectionAnchor.value = { weekday, slotIndex }
  selectionFocus.value = { weekday, slotIndex }
  selectedCourse.value = undefined
  const stateValue = {
    timer: window.setTimeout(() => {
      if (!slotPress) return
      openContextMenuAt(event.clientX, event.clientY)
    }, 550),
    startX: event.clientX,
    startY: event.clientY,
  }
  slotPress = stateValue
  window.addEventListener('pointermove', handleSlotMove)
  window.addEventListener('pointerup', finishSlotPress)
  window.addEventListener('pointercancel', finishSlotPress)
}

function handleSlotMove(event: PointerEvent): void {
  if (!slotPress) return
  const distance = Math.hypot(event.clientX - slotPress.startX, event.clientY - slotPress.startY)
  if (distance <= 6) return
  if (slotPress) window.clearTimeout(slotPress.timer)
  const cell = cellPositionFromPoint(event.clientX, event.clientY)
  if (cell && selectionAnchor.value) {
    selectionFocus.value = {
      weekday: selectionAnchor.value.weekday,
      slotIndex: cell.slotIndex,
    }
  }
}

function cancelSlotPress(): void {
  if (slotPress) window.clearTimeout(slotPress.timer)
  slotPress = undefined
  cellSelecting.value = false
  window.removeEventListener('pointermove', handleSlotMove)
  window.removeEventListener('pointerup', finishSlotPress)
  window.removeEventListener('pointercancel', finishSlotPress)
}

function finishSlotPress(): void {
  cancelSlotPress()
  syncEditorToSelection()
}

function handleSlotEnter(weekday: number, slotIndex: number): void {
  if (!cellSelecting.value) return
  selectionFocus.value = {
    weekday: selectionAnchor.value?.weekday ?? weekday,
    slotIndex,
  }
}

function cellPositionFromPoint(clientX: number, clientY: number): CellPosition | undefined {
  const sheet = document.querySelector<HTMLElement>('.ct-timetable')
  if (!sheet) return undefined
  const rect = sheet.getBoundingClientRect()
  const dayHead = sheet.querySelector<HTMLElement>('.ct-day-head')
  if (!dayHead) return undefined
  const dayRect = dayHead.getBoundingClientRect()
  const weekday = Math.floor((clientX - dayRect.left) / dayRect.width) + 1
  const slotIndex = Math.floor((clientY - rect.top - headerHeight) / rowHeight)
  if (weekday < 1 || weekday > 7 || slotIndex < 0 || slotIndex >= timeSlots.length) {
    return undefined
  }
  return { weekday, slotIndex }
}

function openContextMenu(event: MouseEvent, course?: CurriculumCourseV2): void {
  flushEditor()
  if (course) {
    if (!courseIntersectsSelection(course)) selectCourseRange(course)
    syncEditorToSelection()
  } else {
    const cell = cellPositionFromPoint(event.clientX, event.clientY)
    if (cell && !isPositionInRange(cell, selectedRange.value)) {
      selectionAnchor.value = cell
      selectionFocus.value = cell
    }
    syncEditorToSelection()
  }
  contextMenu.value = {
    x: Math.min(event.clientX, window.innerWidth - 180),
    y: Math.min(event.clientY, window.innerHeight - 210),
  }
}

function openContextMenuAt(clientX: number, clientY: number, course?: CurriculumCourseV2): void {
  flushEditor()
  if (course) {
    if (!courseIntersectsSelection(course)) selectCourseRange(course)
    syncEditorToSelection()
  } else {
    syncEditorToSelection()
  }
  contextMenu.value = {
    x: Math.min(clientX, window.innerWidth - 180),
    y: Math.min(clientY, window.innerHeight - 210),
  }
}

function closeContextMenu(): void {
  contextMenu.value = undefined
}

function contextEdit(): void {
  syncEditorToSelection()
  closeContextMenu()
}

function contextMerge(): void {
  void mergeSelection()
  closeContextMenu()
}

function contextDelete(): void {
  closeContextMenu()
  void clearSelection()
}

function setDefaultSelection(): void {
  selectionAnchor.value = { weekday: 1, slotIndex: 16 }
  selectionFocus.value = { weekday: 1, slotIndex: 16 }
  syncEditorToSelection()
}

function syncEditorToSelection(): void {
  const range = selectedRange.value
  if (!range) {
    selectedCourse.value = undefined
    return
  }
  const exact = activeCourses.value.find(course => rangesEqual(courseToCellRange(course), range))
  selectedCourse.value = exact ? { ...exact } : createCourseDraft()
  editorDirty.value = false
}

function flushEditor(): void {
  if (!editorDirty.value || !selectedCourse.value) return
  const draft = { ...selectedCourse.value }
  editorDirty.value = false
  void saveCourse(draft, false)
}

function isPositionInRange(position: CellPosition, range?: CellRange): boolean {
  if (!range) return false
  return position.weekday >= range.weekdayStart
    && position.weekday <= range.weekdayEnd
    && position.slotIndex >= range.slotStart
    && position.slotIndex <= range.slotEnd
}

function markEditorDirty(): void {
  editorDirty.value = true
}

function isCellSelected(weekday: number, slotIndex: number): boolean {
  const range = selectedRange.value
  if (!range) return false
  return weekday >= range.weekdayStart
    && weekday <= range.weekdayEnd
    && slotIndex >= range.slotStart
    && slotIndex <= range.slotEnd
}

function createCourseAtSelection(): void {
  if (!ensureSavedSchedule()) return
  if (!selectedRange.value) return
  syncEditorToSelection()
}

async function mergeSelection(): Promise<void> {
  if (!ensureSavedSchedule() || !selectedRange.value) return
  const range = selectedRange.value
  if (range.weekdayStart === range.weekdayEnd && range.slotStart === range.slotEnd) {
    setStatus('请先选择多个单元格', true)
    return
  }

  const intersecting = activeCourses.value
    .filter(course => courseIntersectsRange(course, range))
    .sort((a, b) => a.weekday - b.weekday || timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
  const keep = intersecting[0]
  busy.value = true
  try {
    const removedIds = new Set<number>()
    for (const course of intersecting.slice(1)) {
      const result = await send('curriculum-table/course/delete', course.id)
      if (!result.success) throw new Error(result.message || '合并失败')
      removedIds.add(course.id)
    }
    state.value.courses = state.value.courses.filter(course => !removedIds.has(course.id))
    const merged = keep
      ? {
        ...keep,
        weekday: range.weekdayStart,
        weekdayEnd: range.weekdayEnd,
        startTime: minutesToTime(range.slotStart * 30),
        endTime: minutesToTime(Math.min((range.slotEnd + 1) * 30, 23 * 60 + 59)),
      }
      : {
        ...createCourseDraft(),
        name: '无课程',
        weekday: range.weekdayStart,
        weekdayEnd: range.weekdayEnd,
        startTime: minutesToTime(range.slotStart * 30),
        endTime: minutesToTime(Math.min((range.slotEnd + 1) * 30, 23 * 60 + 59)),
      }
    selectedCourse.value = { ...merged }
    await saveCourse(merged)
    setStatus('单元格已合并')
  } catch (error) {
    setStatus(errorMessage(error), true)
  } finally {
    busy.value = false
  }
}

/** 删除与当前选区相交的课程单元格。 */
async function clearSelection(): Promise<void> {
  const range = selectedRange.value
  if (!range) return
  const courses = activeCourses.value.filter(course => (
    courseIntersectsRange(course, range)
  ))
  if (courses.length === 0) {
    selectedCourse.value = undefined
    setStatus('当前单元格没有课程')
    return
  }
  busy.value = true
  try {
    const removedIds = new Set<number>()
    for (const course of courses) {
      const result = await send('curriculum-table/course/delete', course.id)
      if (!result.success) throw new Error(result.message || '清除失败')
      removedIds.add(course.id)
    }
    state.value.courses = state.value.courses.filter(course => !removedIds.has(course.id))
    syncEditorToSelection()
    setStatus('当前单元格已清空')
  } catch (error) {
    setStatus(errorMessage(error), true)
  } finally {
    busy.value = false
  }
}

/** 处理 Excel 风格的保存、合并和清除快捷键。 */
function handleKeyboardShortcut(event: KeyboardEvent): void {
  if (view.value !== 'schedule') return
  const modifier = event.ctrlKey || event.metaKey
  if (modifier && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void saveAll()
    return
  }
  if (modifier && (event.code === 'KeyM' || event.key.toLowerCase() === 'm')) {
    event.preventDefault()
    void mergeSelection()
    return
  }
  if (event.key !== 'Delete') return
  const target = event.target
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return
  }
  event.preventDefault()
  void clearSelection()
}

async function saveAll(): Promise<void> {
  if (selectedCourse.value) await saveCourse(selectedCourse.value)
  await saveSchedule()
}

function ensureSavedSchedule(): boolean {
  if (selectedScheduleId.value && selectedScheduleId.value > 0) return true
  setStatus('请先保存课表', true)
  return false
}

function editCourse(course: CurriculumCourseV2): void {
  selectCourseRange(course)
  selectedCourse.value = { ...course }
}

function beginCoursePointer(event: PointerEvent, course: CurriculumCourseV2): void {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  flushEditor()
  cancelCoursePress()
  selectCourseRange(course)
  const original = { ...course }
  const pointerState = {
    id: course.id,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false,
    longPressed: false,
    timer: window.setTimeout(() => {
      if (!coursePress || coursePress.dragging) return
      coursePress.longPressed = true
      openContextMenuAt(coursePress.startX, coursePress.startY, course)
    }, 550),
    original,
  }
  coursePress = pointerState
  window.addEventListener('pointermove', handleCoursePointerMove)
  window.addEventListener('pointerup', finishCoursePointer)
  window.addEventListener('pointercancel', cancelCoursePointer)
}

function handleCoursePointerMove(event: PointerEvent): void {
  if (!coursePress) return
  const distance = Math.hypot(
    event.clientX - coursePress.startX,
    event.clientY - coursePress.startY,
  )
  if (!coursePress.dragging && distance > 8) {
    coursePress.dragging = true
    dragActive.value = true
    draggingCourseId.value = coursePress.id
    window.clearTimeout(coursePress.timer)
  }
  if (!coursePress.dragging) return
  event.preventDefault()
  updateDraggedCourse(coursePress.id, event.clientX, event.clientY)
}

function updateDraggedCourse(id: number, clientX: number, clientY: number): void {
  const course = state.value.courses.find(item => item.id === id)
  if (!course) return
  const cell = cellPositionFromPoint(clientX, clientY)
  if (!cell) return
  const durationSlots = Math.max(
    1,
    Math.ceil((timeToMinutes(course.endTime) - timeToMinutes(course.startTime)) / 30),
  )
  const weekdaySpan = Math.max(1, (course.weekdayEnd || course.weekday) - course.weekday + 1)
  const weekdayStart = clamp(cell.weekday, 1, 8 - weekdaySpan)
  const slotStart = clamp(cell.slotIndex, 0, timeSlots.length - durationSlots)
  const candidateRange: CellRange = {
    weekdayStart,
    weekdayEnd: weekdayStart + weekdaySpan - 1,
    slotStart,
    slotEnd: slotStart + durationSlots - 1,
  }
  const hasConflict = activeCourses.value.some(item => (
    item.id !== id && courseIntersectsRange(item, candidateRange)
  ))
  if (hasConflict) return
  course.weekday = candidateRange.weekdayStart
  course.weekdayEnd = candidateRange.weekdayEnd
  course.startTime = minutesToTime(slotStart * 30)
  course.endTime = minutesToTime(Math.min((slotStart + durationSlots) * 30, 23 * 60 + 59))
}

function finishCoursePointer(): void {
  if (!coursePress) return
  const pointerState = coursePress
  coursePress = undefined
  cleanupCourseListeners()
  draggingCourseId.value = undefined
  dragActive.value = false
  if (!pointerState.dragging) {
    if (!pointerState.longPressed) editCourse(pointerState.original)
    return
  }
  const course = state.value.courses.find(item => item.id === pointerState.id)
  if (course) void saveCourse({ ...course })
}

function cancelCoursePointer(): void {
  if (!coursePress) return
  const pointerState = coursePress
  coursePress = undefined
  cleanupCourseListeners()
  draggingCourseId.value = undefined
  dragActive.value = false
  if (pointerState.dragging) {
    const course = state.value.courses.find(item => item.id === pointerState.id)
    if (course) Object.assign(course, pointerState.original)
  }
}

function cancelCoursePress(): void {
  if (!coursePress) return
  window.clearTimeout(coursePress.timer)
  coursePress = undefined
  cleanupCourseListeners()
  draggingCourseId.value = undefined
  dragActive.value = false
}

function cleanupCourseListeners(): void {
  window.removeEventListener('pointermove', handleCoursePointerMove)
  window.removeEventListener('pointerup', finishCoursePointer)
  window.removeEventListener('pointercancel', cancelCoursePointer)
}

function beginResize(event: PointerEvent, course: CurriculumCourseV2): void {
  event.preventDefault()
  event.stopPropagation()
  cancelCoursePress()
  resizeState = {
    id: course.id,
    startY: event.clientY,
    endMinutes: timeToMinutes(course.endTime),
  }
  window.addEventListener('pointermove', handleResizeMove)
  window.addEventListener('pointerup', handleResizeEnd)
  window.addEventListener('pointercancel', handleResizeEnd)
}

function handleResizeMove(event: PointerEvent): void {
  if (!resizeState) return
  const course = state.value.courses.find(item => item.id === resizeState?.id)
  if (!course) return
  const deltaSlots = Math.round((event.clientY - resizeState.startY) / rowHeight)
  const minimum = timeToMinutes(course.startTime) + 30
  const end = clamp(resizeState.endMinutes + deltaSlots * 30, minimum, 23 * 60 + 59)
  const candidate = { ...course, endTime: minutesToTime(end) }
  const hasConflict = activeCourses.value.some(item => (
    item.id !== course.id && courseIntersectsRange(item, courseToCellRange(candidate))
  ))
  if (hasConflict) return
  course.endTime = minutesToTime(end)
}

function handleResizeEnd(): void {
  stopResize(true)
}

function stopResize(save: boolean): void {
  window.removeEventListener('pointermove', handleResizeMove)
  window.removeEventListener('pointerup', handleResizeEnd)
  window.removeEventListener('pointercancel', handleResizeEnd)
  if (!resizeState) return
  const course = state.value.courses.find(item => item.id === resizeState?.id)
  resizeState = undefined
  if (save && course) void saveCourse({ ...course })
}

async function saveCourse(course: CourseDraft, updateEditor = true): Promise<void> {
  if (!ensureSavedSchedule()) return
  if (!course.name.trim()) {
    busy.value = true
    try {
      if (course.id && course.id > 0) {
        const result = await send('curriculum-table/course/delete', course.id)
        if (!result.success) throw new Error(result.message || '保存失败')
        state.value.courses = state.value.courses.filter(item => item.id !== course.id)
      }
      editorDirty.value = false
      syncEditorToSelection()
      setStatus('当前单元格为空')
    } catch (error) {
      setStatus(errorMessage(error), true)
    } finally {
      busy.value = false
    }
    return
  }
  const targetRange = courseToCellRange(course)
  const hasConflict = activeCourses.value.some(item => (
    item.id !== course.id && courseIntersectsRange(item, targetRange)
  ))
  if (hasConflict) {
    setStatus('课程范围与已有单元格重叠，请先调整或删除重叠课程', true)
    return
  }
  busy.value = true
  try {
    const payload = {
      ...course,
      id: course.id && course.id > 0 ? course.id : undefined,
    }
    const result = await send('curriculum-table/course/save', payload)
    if (!result.success || !result.data) throw new Error(result.message || '保存失败')
    const savedCourse = { ...result.data }
    state.value.courses = [
      ...state.value.courses.filter(item => item.id !== savedCourse.id),
      savedCourse,
    ]
    editorDirty.value = false
    if (updateEditor) {
      selectedCourse.value = savedCourse
      selectCourseRange(savedCourse)
    }
    setStatus('课程已保存')
  } catch (error) {
    setStatus(errorMessage(error), true)
  } finally {
    busy.value = false
  }
}

function courseStyle(course: CurriculumCourseV2): Record<string, string> {
  const range = courseToCellRange(course)
  return {
    gridColumn: `${range.weekdayStart + 1} / span ${range.weekdayEnd - range.weekdayStart + 1}`,
    gridRow: `${range.slotStart + 2} / span ${range.slotEnd - range.slotStart + 1}`,
  }
}

function courseToCellRange(course: Pick<CurriculumCourseV2, 'weekday' | 'weekdayEnd' | 'startTime' | 'endTime'>): CellRange {
  const slotStart = clamp(Math.floor(timeToMinutes(course.startTime) / 30), 0, 47)
  const slotEnd = clamp(Math.ceil(timeToMinutes(course.endTime) / 30) - 1, slotStart, 47)
  return {
    weekdayStart: course.weekday,
    weekdayEnd: Math.max(course.weekday, course.weekdayEnd || course.weekday),
    slotStart,
    slotEnd,
  }
}

function isCellCovered(weekday: number, slotIndex: number): boolean {
  return activeCourses.value.some(course => {
    const range = courseToCellRange(course)
    return weekday >= range.weekdayStart
      && weekday <= range.weekdayEnd
      && slotIndex >= range.slotStart
      && slotIndex <= range.slotEnd
  })
}

function handleSheetWheel(event: WheelEvent): void {
  if (!event.shiftKey || !(event.currentTarget instanceof HTMLElement)) return
  event.currentTarget.scrollLeft += event.deltaY
  event.preventDefault()
}

function selectCourseRange(course: CurriculumCourseV2): void {
  const startSlot = clamp(Math.floor(timeToMinutes(course.startTime) / 30), 0, 47)
  const endSlot = clamp(Math.ceil(timeToMinutes(course.endTime) / 30) - 1, startSlot, 47)
  selectionAnchor.value = { weekday: course.weekday, slotIndex: startSlot }
  selectionFocus.value = {
    weekday: course.weekdayEnd || course.weekday,
    slotIndex: endSlot,
  }
}

function courseIntersectsSelection(course: CurriculumCourseV2): boolean {
  const range = selectedRange.value
  return range ? courseIntersectsRange(course, range) : false
}

function courseIntersectsRange(course: CurriculumCourseV2, range: CellRange): boolean {
  const courseRange = courseToCellRange(course)
  return courseRange.weekdayStart <= range.weekdayEnd
    && courseRange.weekdayEnd >= range.weekdayStart
    && courseRange.slotStart <= range.slotEnd
    && courseRange.slotEnd >= range.slotStart
}

function normalizeCellRange(
  anchor?: CellPosition,
  focus?: CellPosition,
): CellRange | undefined {
  if (!anchor || !focus) return undefined
  return {
    weekdayStart: anchor.weekday,
    weekdayEnd: anchor.weekday,
    slotStart: Math.min(anchor.slotIndex, focus.slotIndex),
    slotEnd: Math.max(anchor.slotIndex, focus.slotIndex),
  }
}

function rangesEqual(left: CellRange, right: CellRange): boolean {
  return left.weekdayStart === right.weekdayStart
    && left.weekdayEnd === right.weekdayEnd
    && left.slotStart === right.slotStart
    && left.slotEnd === right.slotEnd
}

function selectPush(push: CurriculumPushV2): void {
  pushDraft.value = {
    ...push,
    scheduleIds: [...push.scheduleIds],
    weekdays: [...push.weekdays],
  }
  const bot = state.value.bots.find(item => item.selfId === push.botId)
  pushManualBot.value = !bot
  pushBotSelection.value = bot?.selfId || MANUAL_BOT
}

function newPush(): void {
  const draft = createPushDraft()
  draft.name = uniqueName(draft.name, state.value.pushes.map(push => push.name))
  const id = nextTempId()
  const now = Date.now()
  const temporary: CurriculumPushV2 = {
    ...draft,
    id,
    lastPushAt: '',
    createdAt: now,
    updatedAt: now,
  }
  state.value.pushes = [temporary, ...state.value.pushes]
  pushDraft.value = {
    ...draft,
    id,
    lastPushAt: '',
  }
  const bot = state.value.bots.find(item => item.selfId === draft.botId)
  pushManualBot.value = !bot
  pushBotSelection.value = bot?.selfId || MANUAL_BOT
}

function applyPushBot(): void {
  pushManualBot.value = pushBotSelection.value === MANUAL_BOT
  if (pushManualBot.value) {
    pushDraft.value.botId = ''
    pushDraft.value.platform = ''
    return
  }
  const bot = state.value.bots.find(item => item.selfId === pushBotSelection.value)
  if (bot) {
    pushDraft.value.botId = bot.selfId
    pushDraft.value.platform = bot.platform
  }
}

function togglePushWeekday(weekday: number): void {
  if (pushDraft.value.weekdays.includes(weekday)) {
    pushDraft.value.weekdays = pushDraft.value.weekdays.filter(day => day !== weekday)
  } else {
    pushDraft.value.weekdays = [...pushDraft.value.weekdays, weekday].sort()
  }
}

function togglePushSchedule(id: number, event: Event): void {
  const checked = (event.target as HTMLInputElement).checked
  if (checked) {
    pushDraft.value.scheduleIds = [...new Set([...pushDraft.value.scheduleIds, id])]
  } else {
    pushDraft.value.scheduleIds = pushDraft.value.scheduleIds.filter(scheduleId => scheduleId !== id)
  }
}

async function savePush(): Promise<void> {
  if (!pushDraft.value.channelId.trim()) {
    setStatus('请填写群组 ID', true)
    return
  }
  busy.value = true
  const temporaryId = pushDraft.value.id
  try {
    const payload = {
      ...pushDraft.value,
      id: temporaryId && temporaryId > 0 ? temporaryId : undefined,
    }
    const result = await send('curriculum-table/push/save', payload)
    if (!result.success || !result.data) throw new Error(result.message || '保存失败')
    state.value.pushes = state.value.pushes.map(push => (
      push.id === temporaryId ? result.data : push
    ))
    selectPush(result.data)
    await loadState()
    setStatus('推送设置已保存')
  } catch (error) {
    setStatus(errorMessage(error), true)
  } finally {
    busy.value = false
  }
}

async function deletePush(): Promise<void> {
  const id = pushDraft.value.id
  if (!id || !window.confirm('确定删除这个推送闹钟吗？')) return
  busy.value = true
  try {
    if (id < 0) {
      state.value.pushes = state.value.pushes.filter(push => push.id !== id)
    } else {
      const result = await send('curriculum-table/push/delete', id)
      if (!result.success) throw new Error(result.message || '删除失败')
    }
    await loadState()
    setStatus('推送设置已删除')
  } catch (error) {
    setStatus(errorMessage(error), true)
  } finally {
    busy.value = false
  }
}

function validateSchedule(): boolean {
  if (!scheduleDraft.value.name.trim()) {
    setStatus('请填写课表名称', true)
    return false
  }
  if (!scheduleDraft.value.channelId.trim()) {
    setStatus('请填写群组 ID', true)
    return false
  }
  if (!scheduleDraft.value.userId.trim()) {
    setStatus('请填写用户 ID', true)
    return false
  }
  if (!scheduleDraft.value.termStartDate || !scheduleDraft.value.termEndDate) {
    setStatus('请选择本学期日期', true)
    return false
  }
  if (scheduleDraft.value.termEndDate < scheduleDraft.value.termStartDate) {
    setStatus('本学期结束日期不能早于开始日期', true)
    return false
  }
  return true
}

function setStatus(message: string, error = false): void {
  statusText.value = message
  hasError.value = error
}

function uniqueName(rawName: string, existingNames: string[]): string {
  const names = new Set(existingNames)
  if (!names.has(rawName)) return rawName
  const match = rawName.match(/^(.*?)(?:\s*\((\d+)\))?$/)
  const base = (match?.[1] || rawName).trimEnd()
  let index = Number(match?.[2] || 1) + 1
  while (names.has(`${base} (${index})`)) index++
  return `${base} (${index})`
}

function nextTempId(): number {
  return tempId--
}

function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function minutesToTime(minutes: number): string {
  const value = Math.max(0, Math.min(23 * 60 + 59, snapMinutes(minutes)))
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

function snapMinutes(minutes: number): number {
  return Math.round(minutes / 5) * 5
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function weekdayLabel(weekday: number): string {
  return weekdays.find(day => day.value === weekday)?.label || ''
}

function defaultTermDates(): { startDate: string; endDate: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  if (month >= 9) {
    return { startDate: `${year}-09-01`, endDate: `${year + 1}-02-15` }
  }
  if (month <= 2) {
    return { startDate: `${year - 1}-09-01`, endDate: `${year}-02-15` }
  }
  if (month <= 6) {
    return { startDate: `${year}-03-01`, endDate: `${year}-06-30` }
  }
  return { startDate: `${year}-09-01`, endDate: `${year + 1}-02-15` }
}

function dayOffsetLabel(offset: number): string {
  return ({
    '-1': '前一天',
    '0': '当天',
    '1': '后一天',
  } as Record<string, string>)[String(offset)] || '当天'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
</script>

<style scoped>
.ct-page {
  --ct-bg: #f3f6f5;
  --ct-panel: #ffffff;
  --ct-panel-soft: #edf2f0;
  --ct-border: #d7dfdc;
  --ct-text: #1b2924;
  --ct-muted: #65736d;
  --ct-accent: #147a66;
  --ct-accent-soft: #dcefe9;
  --ct-danger: #b33932;
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  color: var(--ct-text);
  background: var(--ct-bg);
  font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
  font-size: 13px;
}

.ct-page.is-dragging {
  user-select: none;
}

.ct-topbar {
  display: flex;
  align-items: center;
  gap: 22px;
  min-height: 56px;
  padding: 0 18px;
  background: var(--ct-panel);
  border-bottom: 1px solid var(--ct-border);
}

.ct-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 220px;
}

.ct-brand-mark {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  color: #fff;
  background: var(--ct-accent);
  border-radius: 6px;
  font-weight: 700;
}

.ct-brand div {
  display: grid;
}

.ct-brand div span,
.ct-status {
  color: var(--ct-muted);
  font-size: 11px;
}

.ct-tabs {
  display: flex;
  align-self: stretch;
  gap: 4px;
  overflow-x: auto;
}

.ct-tabs button {
  padding: 0 14px;
  color: var(--ct-muted);
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  white-space: nowrap;
}

.ct-tabs button.active {
  color: var(--ct-accent);
  border-bottom-color: var(--ct-accent);
}

.ct-status {
  margin-left: auto;
}

.ct-status.error {
  color: var(--ct-danger);
}

.ct-main {
  flex: 1;
  min-height: 0;
}

.ct-schedule-layout,
.ct-push-layout {
  position: relative;
  display: flex;
  height: 100%;
  min-height: 0;
}

.ct-list-pane {
  display: flex;
  width: 235px;
  flex: 0 0 235px;
  flex-direction: column;
  min-height: 0;
  background: var(--ct-panel);
  border-right: 1px solid var(--ct-border);
}

.ct-pane-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  padding: 0 12px;
  color: var(--ct-muted);
  border-bottom: 1px solid var(--ct-border);
  font-weight: 600;
}

.ct-icon-button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  color: var(--ct-text);
  background: transparent;
  border: 1px solid var(--ct-border);
  border-radius: 5px;
  cursor: pointer;
}

.ct-icon-button:hover {
  color: var(--ct-accent);
  border-color: var(--ct-accent);
}

.ct-schedule-list,
.ct-push-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
}

.ct-schedule-list button,
.ct-push-list button {
  position: relative;
  display: grid;
  width: 100%;
  gap: 3px;
  margin-bottom: 6px;
  padding: 10px;
  color: var(--ct-muted);
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
}

.ct-schedule-list button:hover,
.ct-push-list button:hover,
.ct-schedule-list button.active,
.ct-push-list button.active {
  color: var(--ct-text);
  background: var(--ct-accent-soft);
  border-color: #b5d9cf;
}

.ct-schedule-list button.draft,
.ct-push-list button.draft {
  border-style: dashed;
}

.ct-list-name {
  overflow: hidden;
  color: var(--ct-text);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ct-push-list button {
  grid-template-columns: 12px 1fr;
}

.ct-push-list button .ct-list-name,
.ct-push-list button > span:not(.ct-led):not(.ct-push-time) {
  grid-column: 2;
}

.ct-led {
  width: 9px;
  height: 9px;
  margin-top: 7px;
  background: #c93e38;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(201, 62, 56, 0.12);
}

.ct-led.on {
  background: #2ca66f;
  box-shadow: 0 0 0 3px rgba(44, 166, 111, 0.14);
}

.ct-push-time {
  grid-column: 2;
  color: var(--ct-accent);
  font-size: 18px;
  font-weight: 700;
}

.ct-empty {
  padding: 24px 12px;
  color: var(--ct-muted);
  text-align: center;
}

.ct-editor {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.ct-meta-bar {
  display: grid;
  grid-template-columns: repeat(4, minmax(125px, 1fr));
  gap: 10px;
  padding: 12px;
  background: var(--ct-panel);
  border-bottom: 1px solid var(--ct-border);
}

.ct-meta-bar label,
.ct-cell-form label,
.ct-push-form label {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.ct-meta-bar label > span,
.ct-cell-form label > span,
.ct-push-form label > span {
  color: var(--ct-muted);
  font-size: 11px;
}

input,
select,
textarea {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  color: var(--ct-text);
  background: var(--ct-panel);
  border: 1px solid var(--ct-border);
  border-radius: 5px;
  outline: none;
}

input,
select {
  height: 32px;
  padding: 0 8px;
}

textarea {
  padding: 8px;
  resize: vertical;
}

input:focus,
select:focus,
textarea:focus {
  border-color: var(--ct-accent);
}

.ct-check {
  display: flex !important;
  align-items: center;
  gap: 7px !important;
  align-self: end;
  min-height: 32px;
}

.ct-check input {
  width: 16px;
  height: 16px;
}

.ct-form-actions {
  display: flex;
  align-items: end;
  gap: 8px;
}

.ct-form-actions.vertical {
  display: grid;
  margin-top: 18px;
}

button.primary,
button.danger {
  min-height: 34px;
  padding: 0 13px;
  color: #fff;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
}

button.primary {
  background: var(--ct-accent);
}

button.danger {
  background: var(--ct-danger);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ct-guide {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  padding: 8px 12px;
  color: var(--ct-muted);
  background: #f7faf9;
  border-bottom: 1px solid var(--ct-border);
  font-size: 12px;
}

.ct-guide span::before {
  margin-right: 6px;
  color: var(--ct-accent);
  content: "•";
}

.ct-grid-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 42px;
  padding: 0 12px;
  background: var(--ct-panel);
  border-bottom: 1px solid var(--ct-border);
}

.ct-grid-toolbar span {
  color: var(--ct-muted);
}

.ct-grid-toolbar .ct-small-button:first-of-type {
  margin-left: auto;
}

.ct-active-slot {
  color: var(--ct-accent) !important;
  font-weight: 600;
}

.ct-small-button {
  height: 30px;
  padding: 0 10px;
  color: var(--ct-text);
  background: var(--ct-panel);
  border: 1px solid var(--ct-border);
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
}

.ct-small-button:hover {
  color: var(--ct-accent);
  border-color: var(--ct-accent);
}

.ct-cell-form {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px 10px;
  padding: 12px;
}

.ct-cell-empty {
  display: grid;
  align-content: center;
  justify-items: start;
  gap: 10px;
  min-height: 160px;
  padding: 18px 12px;
  color: var(--ct-muted);
}

.ct-cell-empty strong {
  color: var(--ct-text);
}

.ct-timetable-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--ct-panel);
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.ct-timetable-scroll::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

.ct-timetable-scroll::-webkit-scrollbar-track {
  background: #edf2f0;
}

.ct-timetable-scroll::-webkit-scrollbar-thumb {
  background: #a9bbb5;
  border: 2px solid #edf2f0;
  border-radius: 6px;
}

.ct-timetable {
  display: grid;
  grid-template-columns: 64px repeat(7, minmax(0, 1fr));
  grid-template-rows: 36px repeat(48, 24px);
  min-width: 603px;
  width: 100%;
  background: #fff;
}

.ct-grid-corner,
.ct-day-head {
  position: sticky;
  top: 0;
  z-index: 9;
  display: grid;
  place-items: center;
  color: var(--ct-text);
  background: rgba(255, 255, 255, 0.98);
  border-right: 1px solid var(--ct-border);
  border-bottom: 1px solid var(--ct-border);
  font-weight: 600;
}

.ct-grid-corner {
  left: 0;
  z-index: 12;
  color: var(--ct-muted);
  font-size: 11px;
}

.ct-time-label {
  position: sticky;
  left: 0;
  z-index: 7;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 7px;
  color: var(--ct-muted);
  background: #fafbfa;
  border-right: 1px solid var(--ct-border);
  border-bottom: 1px solid #edf1ef;
  font-size: 10px;
}

.ct-slot {
  position: relative;
  z-index: 1;
  min-width: 0;
  padding: 0;
  background: transparent;
  border: 0;
  border-right: 1px solid #edf1ef;
  border-bottom: 1px solid #edf1ef;
  cursor: cell;
  touch-action: pan-x pan-y;
  transition: background-color 0.12s ease, box-shadow 0.12s ease;
}

.ct-slot:hover {
  background: rgba(20, 122, 102, 0.14);
  box-shadow: inset 0 0 0 1px rgba(20, 122, 102, 0.32);
}

.ct-slot.selected {
  background: rgba(20, 122, 102, 0.2);
  box-shadow: inset 0 0 0 2px var(--ct-accent);
}

.ct-course {
  position: relative;
  z-index: 2;
  display: grid;
  align-content: start;
  gap: 2px;
  box-sizing: border-box;
  overflow: hidden;
  padding: 6px 7px 14px;
  color: var(--ct-text);
  text-align: left;
  background: #f7fbf9;
  border: 1px solid #b8d9cf;
  border-left: 4px solid var(--ct-accent);
  border-radius: 0;
  box-shadow: none;
  cursor: grab;
  touch-action: none;
}

.ct-course:hover,
.ct-course.selected {
  z-index: 5;
  border-color: var(--ct-accent);
  box-shadow: 0 5px 14px rgba(31, 55, 47, 0.2);
}

.ct-course.dragging {
  z-index: 10;
  opacity: 0.78;
  cursor: grabbing;
}

.ct-course.no-course {
  color: var(--ct-muted);
  background: #f1f4f3;
  border-color: #c8d1ce;
  border-left-color: #8e9d98;
}

.ct-course strong,
.ct-course span,
.ct-course small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ct-course span,
.ct-course small {
  color: var(--ct-muted);
  font-size: 11px;
}

.ct-resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 10px;
  border-bottom: 3px solid var(--ct-accent);
  cursor: ns-resize;
}

.ct-push-preview {
  box-sizing: border-box;
  width: 290px;
  flex: 0 0 290px;
  padding: 0 12px 16px;
  overflow: auto;
  background: var(--ct-panel);
  border-left: 1px solid var(--ct-border);
}

.ct-inspector {
  box-sizing: border-box;
  width: auto;
  min-width: 320px;
  max-width: 520px;
  flex: 1 1 380px;
  padding: 0 12px 16px;
  overflow: auto;
  background: var(--ct-panel);
  border-left: 1px solid var(--ct-border);
}

.ct-push-form {
  flex: 1;
  min-width: 0;
  padding: 18px;
  overflow: auto;
}

.ct-push-form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(150px, 1fr));
  gap: 14px;
}

.ct-check-first {
  order: -1;
}

.ct-subsection {
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid var(--ct-border);
}

.ct-subsection-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}

.ct-subsection-title span {
  color: var(--ct-muted);
  font-size: 12px;
}

.ct-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ct-chip {
  min-width: 54px;
  height: 34px;
  padding: 0 12px;
  color: var(--ct-muted);
  background: var(--ct-panel);
  border: 1px solid var(--ct-border);
  border-radius: 17px;
  cursor: pointer;
}

.ct-chip.active {
  color: #fff;
  background: var(--ct-accent);
  border-color: var(--ct-accent);
}

.ct-schedule-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(180px, 1fr));
  gap: 8px;
}

.ct-schedule-options label {
  display: grid;
  grid-template-columns: 18px 1fr;
  align-items: center;
  padding: 8px;
  background: var(--ct-panel-soft);
  border-radius: 5px;
}

.ct-schedule-options input {
  width: 15px;
  height: 15px;
}

.ct-schedule-options small {
  grid-column: 2;
  color: var(--ct-muted);
}

.ct-push-form > .ct-form-actions {
  margin-top: 24px;
}

.ct-preview-time {
  margin: 26px 0 14px;
  color: var(--ct-accent);
  font-size: 40px;
  font-weight: 700;
}

.ct-preview-line {
  padding: 8px 0;
  border-bottom: 1px solid var(--ct-border);
}

.ct-preview-line.muted {
  color: var(--ct-muted);
}

.ct-empty-view {
  display: grid;
  height: 100%;
  place-items: center;
  color: var(--ct-muted);
}

.ct-context-menu {
  position: fixed;
  z-index: 100;
  display: grid;
  width: 170px;
  padding: 5px;
  background: var(--ct-panel);
  border: 1px solid var(--ct-border);
  border-radius: 6px;
  box-shadow: 0 12px 30px rgba(20, 38, 31, 0.22);
}

.ct-context-menu button {
  min-height: 32px;
  padding: 0 10px;
  color: var(--ct-text);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}

.ct-context-menu button:hover {
  background: var(--ct-accent-soft);
}

.ct-context-menu .danger-text {
  color: var(--ct-danger);
}

@media (max-width: 1100px) {
  .ct-meta-bar {
    grid-template-columns: repeat(2, minmax(140px, 1fr));
  }

  .ct-inspector {
    min-width: 300px;
    max-width: 360px;
    flex: 0 0 320px;
  }

  .ct-push-preview {
    display: none;
  }
}

@media (max-width: 760px) {
  .ct-topbar {
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 10px 0;
  }

  .ct-brand {
    min-width: 0;
  }

  .ct-brand div span,
  .ct-status {
    display: none;
  }

  .ct-tabs {
    order: 2;
    width: 100%;
    min-height: 42px;
  }

  .ct-tabs button {
    flex: 1;
    padding: 0 8px;
  }

  .ct-schedule-layout,
  .ct-push-layout {
    flex-direction: column;
  }

  .ct-list-pane {
    width: 100%;
    max-height: 152px;
    flex-basis: auto;
    border-right: 0;
    border-bottom: 1px solid var(--ct-border);
  }

  .ct-schedule-list,
  .ct-push-list {
    display: flex;
    gap: 6px;
    overflow-x: auto;
  }

  .ct-schedule-list button,
  .ct-push-list button {
    min-width: 190px;
    margin-bottom: 0;
  }

  .ct-meta-bar,
  .ct-cell-form,
  .ct-push-form-grid {
    grid-template-columns: 1fr;
  }

  .ct-form-actions {
    align-items: stretch;
  }

  .ct-form-actions button {
    flex: 1;
  }

  .ct-guide {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .ct-grid-toolbar {
    flex-wrap: wrap;
    padding: 6px 12px;
  }

  .ct-grid-toolbar .ct-small-button {
    flex: 1;
  }

  .ct-push-form {
    padding: 12px;
  }

  .ct-schedule-options {
    grid-template-columns: 1fr;
  }

  .ct-inspector {
    min-width: 0;
    max-width: none;
    width: 100%;
    max-height: 330px;
    flex-basis: auto;
    border-top: 1px solid var(--ct-border);
    border-left: 0;
  }
}
</style>
