// 登录凭证存储：记住设备 → localStorage；否则 sessionStorage。

const TOKEN_KEY = 'fluxdown.token'
const BASE_KEY = 'fluxdown.base'

export function getToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY) ?? ''
}

/** 服务器基址。同源部署时为空字符串（相对路径）。 */
export function getBase(): string {
  return sessionStorage.getItem(BASE_KEY) ?? localStorage.getItem(BASE_KEY) ?? ''
}

export function saveCredentials(base: string, token: string, remember: boolean) {
  clearCredentials()
  const store = remember ? localStorage : sessionStorage
  store.setItem(TOKEN_KEY, token)
  store.setItem(BASE_KEY, base)
}

export function clearCredentials() {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(BASE_KEY)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(BASE_KEY)
}

export function isAuthenticated(): boolean {
  return getToken() !== ''
}
