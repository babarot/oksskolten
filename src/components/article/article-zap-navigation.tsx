import { useKeyboardNavigationContext } from '../../contexts/keyboard-navigation-context'
import { useKeyboardNavigation } from '../../hooks/use-keyboard-navigation'
import { useAppLayout } from '../../app'

interface ArticleZapNavigationProps {
  currentArticleId: string
}

export function ArticleZapNavigation({ currentArticleId }: ArticleZapNavigationProps) {
  const { articleIds, setFocusedItemId, navigateToArticle } = useKeyboardNavigationContext()
  const { settings: { keyboardNavigation, keybindings } } = useAppLayout()

  useKeyboardNavigation({
    items: articleIds,
    focusedItemId: currentArticleId,
    onFocusChange: (id) => {
      setFocusedItemId(id)
      navigateToArticle(id)
    },
    enabled: keyboardNavigation === 'on' && articleIds.length > 0,
    keyBindings: keybindings,
  })

  return null
}
