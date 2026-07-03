// 对话框开关的全局 store（跨组件打开新建下载对话框用）。
// HLS/BT 选择对话框由 ws.ts 的 hlsRequestStore / btRequestStore 驱动，不在此列。

import { Store } from './ws'

export const newDownloadOpenStore = new Store<boolean>(false)

export function openNewDownload() {
  newDownloadOpenStore.set(true)
}
