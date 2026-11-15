import type { Field, GroupId } from '../types.ts'

export const GROUPS: { id: GroupId; label: string; color: string; background: string; description: string }[] = [
  { id: 'injections', label: 'منتجات الحقن', color: '#7c56ac', background: '#f2ecfa', description: 'أولوية التصنيف حسب اسم المنتج' },
  { id: 'sent', label: 'مرسل فقط', color: '#b57a20', background: '#fff6e5', description: 'إرسال معلّق أكبر من صفر، والاستقبال صفر' },
  { id: 'received', label: 'مستلم فقط', color: '#287da9', background: '#eaf5fc', description: 'استقبال معلّق أكبر من صفر، والإرسال صفر' },
  { id: 'both', label: 'إرسال واستقبال', color: '#b55878', background: '#fceef3', description: 'كميتا الإرسال والاستقبال أكبر من صفر' },
  { id: 'active', label: 'Active فقط', color: '#218567', background: '#eaf7f0', description: 'Active أكبر من صفر، والإرسال والاستقبال صفر' },
]

export const FIELD_LABELS: Record<Field, string> = {
  batch: 'رقم الباتش', product: 'اسم المنتج', quantity: 'Quantity', active: 'Active',
  sent: 'Quantity sent pending', received: 'Quantity Receive Pending', gtin: 'GTIN (اختياري)',
}
export const RASD_FIELDS: Field[] = ['batch', 'product', 'quantity', 'active', 'sent', 'received', 'gtin']
export const WAREHOUSE_FIELDS: Field[] = ['batch']
export const ALIASES: Record<Field, string[]> = {
  batch: ['BN', 'Batch No', 'Batch No.', 'Batch Number', 'رقم الباتش', 'الباتش'],
  product: ['Product Name', 'Product', 'Item Name', 'Item Description', 'Trade Name', 'اسم المنتج', 'اسم الصنف', 'اسم الدواء'],
  quantity: ['Quantity', 'الكمية'], active: ['Active'],
  sent: ['Quantity sent pending'], received: ['Quantity Receive Pending', 'Quantity Received Pending'],
  gtin: ['GTIN', 'GTIN Code'],
}

// Unicode boundaries also handle Arabic. Add entries here to change detection.
export const INJECTION_TERMS = [
  'injection', 'injections', 'inj', 'syringe', 'syringes', 'vial', 'vials',
  'ampoule', 'ampoules', 'ampule', 'ampules',
  'حقن', 'الحقن', 'حقنة', 'حقنه', 'للحقن', 'للحقن الوريدي', 'للحقن العضلي',
  'أمبول', 'امبول', 'أمبولات', 'امبولات', 'فيال', 'سرنجة', 'سرنجه',
]
export const DUPLICATE_POLICY = 'نحتسب الكميات مرة واحدة عند تطابقها للباتش المكرر. عند اختلافها يجب اختيار صف معتمد قبل التصدير. نحفظ جميع الصفوف الأصلية ولا نجمع كمياتها تلقائيًا.'
export const MAX_FILE_BYTES = 100 * 1024 * 1024
export const MAX_ROWS = 300_000
export const MAX_COLUMNS = 512
