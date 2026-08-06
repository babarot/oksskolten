import { useCallback, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { LabelWithCount } from '../../../../shared/types'
import { useAppLayout } from '../../../app'
import { fetcher, apiDelete, apiPatch, apiPost } from '../../../lib/fetcher'
import { useI18n } from '../../../lib/i18n'
import { ConfirmDialog } from '../../../components/ui/confirm-dialog'
import { RadioGroup } from '../../../components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select'
import { toast } from 'sonner'

type MatchField = 'title' | 'full_text' | 'both'
type RuleType = 'and' | 'or' | 'not'
interface Rule { match_text: string; match_field: MatchField; rule_type: RuleType }
interface LabelForm { name: string; exclusive: boolean; rules: Rule[] }

const emptyRule = (): Rule => ({ match_text: '', match_field: 'both', rule_type: 'or' })
const emptyForm = (): LabelForm => ({ name: '', exclusive: false, rules: [emptyRule()] })

function toForm(label: LabelWithCount): LabelForm {
  const rules = label.rules.length > 0
    ? label.rules.map(rule => ({ match_text: rule.match_text, match_field: rule.match_field, rule_type: rule.rule_type }))
    : [{ match_text: label.match_text, match_field: label.match_field, rule_type: 'or' as const }]
  return { name: label.name, exclusive: label.exclusive === 1, rules }
}

export function LabelsSection() {
  const { t } = useI18n()
  const { settings } = useAppLayout()
  const { mutate: globalMutate } = useSWRConfig()
  const { data } = useSWR<{ labels: LabelWithCount[] }>('/api/labels', fetcher)
  const labels = data?.labels ?? []
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const refresh = useCallback(() => {
    void globalMutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/labels'))
  }, [globalMutate])
  const cancel = () => { setEditingId(null); setAdding(false); setForm(emptyForm()) }
  const save = async () => {
    if (!form.name.trim() || form.rules.some(rule => !rule.match_text.trim())) return
    try {
      if (editingId !== null) await apiPatch(`/api/labels/${editingId}`, form)
      else await apiPost('/api/labels', form)
      cancel(); refresh()
    } catch { toast.error(t('settings.labelSaveError')) }
  }
  const deleteLabel = async () => {
    if (deletingId === null) return
    try { await apiDelete(`/api/labels/${deletingId}`); setDeletingId(null); refresh() } catch { toast.error(t('settings.labelDeleteError')) }
  }
  const deleting = labels.find(label => label.id === deletingId)

  return (
    <section>
      <h2 className="text-base font-semibold text-text mb-1">{t('settings.labels')}</h2>
      <p className="text-xs text-muted mb-5">{t('settings.labelsDesc')}</p>
      <div className="mb-5">
        <p className="text-sm text-text mb-2">{t('settings.labelUnreadOnly')}</p>
        <RadioGroup name="labelUnreadOnly" options={[{ value: 'on' as const, label: t('settings.labelUnreadOnlyOn') }, { value: 'off' as const, label: t('settings.labelUnreadOnlyOff') }]} value={settings.labelUnreadOnly} onChange={value => settings.setLabelUnreadOnly(value)} />
      </div>
      <div className="space-y-2">
        {labels.length === 0 && !adding && <p className="text-sm text-muted">{t('settings.labelsEmpty')}</p>}
        {labels.map(label => editingId === label.id
          ? <LabelForm key={label.id} form={form} setForm={setForm} onSave={save} onCancel={cancel} t={t} />
          : <LabelRow key={label.id} label={label} onEdit={() => { setEditingId(label.id); setForm(toForm(label)); setAdding(false) }} onDelete={() => setDeletingId(label.id)} t={t} />)}
        {adding && <LabelForm form={form} setForm={setForm} onSave={save} onCancel={cancel} t={t} />}
      </div>
      {!adding && editingId === null && <button type="button" onClick={() => { setAdding(true); setForm(emptyForm()) }} className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:opacity-80"><Plus size={14} />{t('settings.addLabel')}</button>}
      {deleting && <ConfirmDialog title={t('feeds.delete')} message={t('settings.labelDeleteConfirm', { name: deleting.name })} confirmLabel={t('feeds.delete')} danger onConfirm={deleteLabel} onCancel={() => setDeletingId(null)} />}
    </section>
  )
}

function LabelRow({ label, onEdit, onDelete, t }: { label: LabelWithCount; onEdit: () => void; onDelete: () => void; t: ReturnType<typeof useI18n>['t'] }) {
  const rules = label.rules.length > 0 ? label.rules : [{ match_text: label.match_text, match_field: label.match_field, rule_type: 'or' as const }]
  return <div className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-bg-card">
    <div className="min-w-0 flex-1"><span className="text-sm font-medium text-text">{label.name}</span>{label.exclusive === 1 && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-muted/20 text-muted">{t('settings.labelExclusive')}</span>}
      {rules.map((rule, index) => <div key={index} className="mt-0.5 text-xs text-muted"><span className="font-mono uppercase text-[10px] mr-1 opacity-60">{rule.rule_type}</span>{rule.match_text} · {rule.match_field === 'title' ? t('settings.labelMatchFieldTitle') : rule.match_field === 'full_text' ? t('settings.labelMatchFieldFullText') : t('settings.labelMatchFieldBoth')}</div>)}
    </div>
    <div className="flex items-center gap-3 shrink-0"><span className="text-xs text-muted tabular-nums">{label.article_count}</span><button type="button" onClick={onEdit} className="text-muted hover:text-text" aria-label={t('settings.editLabel')}><Pencil size={14} /></button><button type="button" onClick={onDelete} className="text-muted hover:text-error" aria-label={t('feeds.delete')}><Trash2 size={14} /></button></div>
  </div>
}

function LabelForm({ form, setForm, onSave, onCancel, t }: { form: LabelForm; setForm: (form: LabelForm) => void; onSave: () => void; onCancel: () => void; t: ReturnType<typeof useI18n>['t'] }) {
  const updateRule = (index: number, patch: Partial<Rule>) => setForm({ ...form, rules: form.rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule) })
  const valid = form.name.trim() !== '' && form.rules.every(rule => rule.match_text.trim() !== '')
  return <div className="flex flex-col gap-2 p-3 rounded-lg border border-accent bg-bg-card">
    <input autoFocus type="text" placeholder={t('settings.labelName')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-2 py-1 text-sm rounded-lg border border-border bg-bg text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent" />
    {form.rules.map((rule, index) => <div key={index} className="flex items-center gap-1.5"><Select value={rule.rule_type} onValueChange={value => updateRule(index, { rule_type: value as RuleType })}><SelectTrigger className="h-7 text-xs w-28 shrink-0"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="or">{t('settings.labelRuleTypeOr')}</SelectItem><SelectItem value="and">{t('settings.labelRuleTypeAnd')}</SelectItem><SelectItem value="not">{t('settings.labelRuleTypeNot')}</SelectItem></SelectContent></Select><input type="text" placeholder={t('settings.labelMatchText')} value={rule.match_text} onChange={e => updateRule(index, { match_text: e.target.value })} className="flex-1 min-w-0 px-2 py-1 text-xs rounded-lg border border-border bg-bg text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent" /><Select value={rule.match_field} onValueChange={value => updateRule(index, { match_field: value as MatchField })}><SelectTrigger className="h-7 text-xs w-28 shrink-0"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="both">{t('settings.labelMatchFieldBoth')}</SelectItem><SelectItem value="title">{t('settings.labelMatchFieldTitle')}</SelectItem><SelectItem value="full_text">{t('settings.labelMatchFieldFullText')}</SelectItem></SelectContent></Select>{form.rules.length > 1 && <button type="button" onClick={() => setForm({ ...form, rules: form.rules.filter((_, i) => i !== index) })} className="p-1 text-muted hover:text-error" aria-label={t('settings.labelDeleteRule')}><X size={14} /></button>}</div>)}
    <button type="button" onClick={() => setForm({ ...form, rules: [...form.rules, emptyRule()] })} className="self-start inline-flex items-center gap-1 text-xs text-accent"><Plus size={12} />{t('settings.labelAddRule')}</button>
    <label className="flex items-center gap-2 cursor-pointer text-xs text-text"><input type="checkbox" checked={form.exclusive} onChange={e => setForm({ ...form, exclusive: e.target.checked })} className="rounded accent-accent" />{t('settings.labelExclusive')} <span className="text-muted">— {t('settings.labelExclusiveDesc')}</span></label>
    <div className="flex items-center gap-2 self-end"><button type="button" disabled={!valid} onClick={onSave} className="p-1.5 rounded-lg text-accent hover:bg-hover disabled:opacity-40" aria-label={t('settings.addLabel')}><Check size={16} /></button><button type="button" onClick={onCancel} className="p-1.5 rounded-lg text-muted hover:bg-hover" aria-label={t('confirm.cancel')}><X size={16} /></button></div>
  </div>
}
