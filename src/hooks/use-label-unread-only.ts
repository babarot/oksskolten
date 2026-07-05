import { createLocalStorageHook } from './create-local-storage-hook'

export type LabelUnreadOnly = 'on' | 'off'

const useHook = createLocalStorageHook<LabelUnreadOnly>('label-unread-only', 'off', ['on', 'off'])

export function useLabelUnreadOnly() {
  const [labelUnreadOnly, setLabelUnreadOnly] = useHook()
  return { labelUnreadOnly, setLabelUnreadOnly }
}
