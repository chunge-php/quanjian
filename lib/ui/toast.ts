'use client'
import { useSyncExternalStore } from 'react'

export type ToastKind = 'info' | 'warn' | 'error' | 'success'
export interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}

let items: ToastItem[] = []
let seq = 0
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

export function toast(text: string, kind: ToastKind = 'info', ttlMs = 4200) {
  const id = ++seq
  items = [...items, { id, kind, text }].slice(-4)
  emit()
  if (typeof window !== 'undefined') window.setTimeout(() => dismissToast(id), ttlMs)
  return id
}

export function dismissToast(id: number) {
  if (!items.some((t) => t.id === id)) return
  items = items.filter((t) => t.id !== id)
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
const getSnapshot = () => items
const EMPTY: ToastItem[] = []
const getServerSnapshot = (): ToastItem[] => EMPTY

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
