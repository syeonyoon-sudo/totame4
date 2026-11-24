import { ChevronLeft } from 'lucide-react'
import { ScreenHeader } from '../components/ui'
import { t } from '../i18n'
import ReportView from './ReportView'

/** MY > 이동 리포트 */
export default function ReportScreen({ onClose }: { onClose: () => void }) {
  return (
    <div className="safe-top anim-fade-up absolute inset-0 z-40 flex flex-col bg-white">
      <ScreenHeader
        title={t('tab.report')}
        left={
          <button type="button" aria-label={t('common.back')} onClick={onClose} className="flex h-11 w-11 items-center justify-center">
            <ChevronLeft size={26} />
          </button>
        }
      />
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <ReportView />
      </div>
    </div>
  )
}
