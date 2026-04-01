import { type ElementType, type ReactNode } from 'react'
import { Pencil, CheckCheck, Trash2, FolderInput, RefreshCw, Search, BellRing, LayoutTemplate } from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
} from '../ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu'

interface FeedMenuProps {
  children: ReactNode
  feedType?: 'rss' | 'clip'
  categories?: Array<{ id: number; name: string }>
  onRename: () => void
  onMarkAllRead: () => void
  onDelete: () => void
  onMoveToCategory?: (categoryId: number | null) => void
  currentViewType?: 'article' | 'social' | null
  onViewTypeChange?: (viewType: 'article' | 'social' | null) => void
  onFetch?: () => void
  onReDetect?: () => void
  onConfigureNotifications?: () => void
}

type MenuComponentSet = {
  Item: ElementType
  RadioGroup: ElementType
  RadioItem: ElementType
  Sub: ElementType
  SubTrigger: ElementType
  SubContent: ElementType
  Separator: ElementType
}

type FeedMenuContentProps = Omit<FeedMenuProps, 'children'> & {
  components: MenuComponentSet
}

function FeedMenuContent({
  feedType,
  categories = [],
  onRename,
  onMarkAllRead,
  onDelete,
  onMoveToCategory,
  currentViewType,
  onViewTypeChange,
  onFetch,
  onReDetect,
  onConfigureNotifications,
  components,
}: FeedMenuContentProps) {
  const { t } = useI18n()
  const isClip = feedType === 'clip'
  const {
    Item,
    RadioGroup,
    RadioItem,
    Sub,
    SubTrigger,
    SubContent,
    Separator,
  } = components

  return (
    <>
      <Item onSelect={onRename}>
        <Pencil size={16} strokeWidth={1.5} />
        {t('feeds.rename')}
      </Item>
      <Item onSelect={onMarkAllRead}>
        <CheckCheck size={16} strokeWidth={1.5} />
        {t('feeds.markAllRead')}
      </Item>

      {!isClip && onMoveToCategory && (
        <Sub>
          <SubTrigger>
            <FolderInput size={16} strokeWidth={1.5} />
            {t('category.moveToCategory')}
          </SubTrigger>
          <SubContent>
            <Item onSelect={() => onMoveToCategory(null)}>
              {t('category.uncategorized')}
            </Item>
            {categories.map(cat => (
              <Item key={cat.id} onSelect={() => onMoveToCategory(cat.id)}>
                {cat.name}
              </Item>
            ))}
          </SubContent>
        </Sub>
      )}

      {!isClip && onViewTypeChange && (
        <Sub>
          <SubTrigger>
            <LayoutTemplate size={16} strokeWidth={1.5} />
            {t('feeds.viewAs')}
          </SubTrigger>
          <SubContent>
            <RadioGroup value={currentViewType ?? 'auto'}>
              <RadioItem value="auto" onSelect={() => onViewTypeChange(null)}>
                {t('feeds.viewType.auto')}
              </RadioItem>
              <RadioItem value="article" onSelect={() => onViewTypeChange('article')}>
                {t('feeds.viewType.article')}
              </RadioItem>
              <RadioItem value="social" onSelect={() => onViewTypeChange('social')}>
                {t('feeds.viewType.social')}
              </RadioItem>
            </RadioGroup>
          </SubContent>
        </Sub>
      )}

      {onFetch && !isClip && (
        <Item onSelect={onFetch}>
          <RefreshCw size={16} strokeWidth={1.5} />
          {t('feeds.fetch')}
        </Item>
      )}

      {!isClip && onReDetect && (
        <Item onSelect={onReDetect}>
          <Search size={16} strokeWidth={1.5} />
          {t('feeds.reDetect')}
        </Item>
      )}

      {!isClip && onConfigureNotifications && (
        <Item onSelect={onConfigureNotifications}>
          <BellRing size={16} strokeWidth={1.5} />
          {t('feeds.pushNotifications')}
        </Item>
      )}

      {!isClip && (
        <>
          <Separator />
          <Item onSelect={onDelete} className="text-error">
            <Trash2 size={16} strokeWidth={1.5} />
            {t('feeds.delete')}
          </Item>
        </>
      )}
    </>
  )
}

const contextMenuComponents: MenuComponentSet = {
  Item: ContextMenuItem,
  RadioGroup: ContextMenuRadioGroup,
  RadioItem: ContextMenuRadioItem,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
  Separator: ContextMenuSeparator,
}

const dropdownMenuComponents: MenuComponentSet = {
  Item: DropdownMenuItem,
  RadioGroup: DropdownMenuRadioGroup,
  RadioItem: DropdownMenuRadioItem,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
  Separator: DropdownMenuSeparator,
}

export function FeedContextMenu({
  children,
  ...props
}: FeedMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <FeedMenuContent components={contextMenuComponents} {...props} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function FeedDropdownMenu({
  children,
  ...props
}: FeedMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <FeedMenuContent components={dropdownMenuComponents} {...props} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface MultiSelectMenuProps {
  children: ReactNode
  selectedCount: number
  categories: Array<{ id: number; name: string }>
  onMoveToCategory: (categoryId: number | null) => void
  onMarkAllRead: () => void
  onFetch: () => void
  onDelete: () => void
}

export function MultiSelectContextMenu({
  children,
  selectedCount,
  categories,
  onMoveToCategory,
  onMarkAllRead,
  onFetch,
  onDelete,
}: MultiSelectMenuProps) {
  const { t } = useI18n()

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <div className="px-2 py-1.5 text-[11px] text-muted">
          {t('feeds.selectedCount', { count: String(selectedCount) })}
        </div>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <FolderInput size={16} strokeWidth={1.5} />
            {t('feeds.bulkMoveToCategory')}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onSelect={() => onMoveToCategory(null)}>
              {t('category.uncategorized')}
            </ContextMenuItem>
            {categories.map(cat => (
              <ContextMenuItem key={cat.id} onSelect={() => onMoveToCategory(cat.id)}>
                {cat.name}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onSelect={onMarkAllRead}>
          <CheckCheck size={16} strokeWidth={1.5} />
          {t('feeds.bulkMarkAllRead')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={onFetch}>
          <RefreshCw size={16} strokeWidth={1.5} />
          {t('feeds.bulkFetch')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onDelete} className="text-error">
          <Trash2 size={16} strokeWidth={1.5} />
          {t('feeds.bulkDelete', { count: String(selectedCount) })}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

interface CategoryMenuProps {
  children: ReactNode
  onRename: () => void
  onMarkAllRead: () => void
  onDelete: () => void
  onFetch?: () => void
}

export function CategoryContextMenu({
  children,
  onRename,
  onMarkAllRead,
  onDelete,
  onFetch,
}: CategoryMenuProps) {
  const { t } = useI18n()

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onRename}>
          <Pencil size={16} strokeWidth={1.5} />
          {t('category.rename')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={onMarkAllRead}>
          <CheckCheck size={16} strokeWidth={1.5} />
          {t('category.markAllRead')}
        </ContextMenuItem>
        {onFetch && (
          <ContextMenuItem onSelect={onFetch}>
            <RefreshCw size={16} strokeWidth={1.5} />
            {t('category.fetchAll')}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onDelete} className="text-error">
          <Trash2 size={16} strokeWidth={1.5} />
          {t('category.delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
