// 过滤器操作符类型
export type FilterOperator =
  | 'equals'        // 等于
  | 'notEquals'     // 不等于
  | 'contains'      // 包含
  | 'notContains'   // 不包含
  | 'greaterThan'   // 大于
  | 'lessThan'      // 小于
  | 'greaterOrEqual' // 大于等于
  | 'lessOrEqual'    // 小于等于
  | 'in'            // 在列表中
  | 'notIn'         // 不在列表中

// 过滤器字段类型
export type FilterField =
  | 'userId'           // 用户ID
  | 'channelId'        // 频道ID
  | 'guildId'          // 群组ID
  | 'selfId'           // 机器人ID
  | 'platform'         // 平台
  | 'isDirect'         // 是否私聊
  | 'authority'        // 用户权限等级
  | 'nickname'         // 用户昵称
  | 'username'         // 用户名
  | 'roles'            // 用户角色列表

// 单个过滤条件
export interface FilterCondition {
  field: FilterField
  operator: FilterOperator
  value: string | number | boolean
  connector?: 'and' | 'or'  // 与上一个条件的连接关系（第一个条件不需要）
}

// 过滤器组
export interface FilterGroup {
  connector?: 'and' | 'or'  // 与上一组的连接关系（第一组不需要）
  conditions: FilterCondition[]
}

export interface Dialogue {
  id: any
  question: string
  answer: string
  type: 'keyword' | 'regexp'
  // 新的过滤器系统
  filterGroups?: FilterGroup[]  // 过滤器组列表（组之间是 AND 关系）
  // 保留旧字段以兼容
  scope?: 'global' | 'group' | 'private'
  contextId?: string
}