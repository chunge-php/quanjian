import type { FacilityCategoryMeta } from './types'

/** 设施类别定义：queries 为百度地点检索关键词；standardRadiusM 参考《社区生活圈规划技术指南》TD/T 1062-2021 */
export const FACILITY_CATEGORIES: FacilityCategoryMeta[] = [
  {
    key: 'market',
    label: '菜市场',
    queries: ['菜市场', '农贸市场', '生鲜超市'],
    essential: true,
    standardRadiusM: 1000,
  },
  {
    key: 'pharmacy',
    label: '药店',
    queries: ['药店', '大药房'],
    essential: true,
    standardRadiusM: 1000,
  },
  {
    key: 'primary_school',
    label: '小学',
    queries: ['小学'],
    tags: ['教育培训;小学'],
    essential: true,
    standardRadiusM: 1000,
  },
  {
    key: 'kindergarten',
    label: '幼儿园',
    queries: ['幼儿园'],
    essential: false,
    standardRadiusM: 500,
  },
  {
    key: 'clinic',
    label: '社区医疗',
    queries: ['社区卫生服务中心', '社区医院', '诊所'],
    essential: false,
    standardRadiusM: 1000,
  },
  {
    key: 'elderly',
    label: '养老服务',
    queries: ['养老院', '社区养老服务站', '老年活动中心'],
    essential: false,
    standardRadiusM: 1000,
  },
  {
    key: 'supermarket',
    label: '超市便利店',
    queries: ['超市', '便利店'],
    essential: false,
    standardRadiusM: 500,
  },
  {
    key: 'park',
    label: '公园绿地',
    queries: ['公园', '广场', '绿地'],
    essential: false,
    standardRadiusM: 1000,
  },
  {
    key: 'bus_stop',
    label: '公交地铁站',
    queries: ['公交车站', '地铁站'],
    essential: false,
    standardRadiusM: 500,
  },
  {
    key: 'bank',
    label: '银行网点',
    queries: ['银行', 'ATM'],
    essential: false,
    standardRadiusM: 1000,
  },
]

export const ESSENTIAL_CATEGORIES = FACILITY_CATEGORIES.filter((c) => c.essential).map((c) => c.key)
