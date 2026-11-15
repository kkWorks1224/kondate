import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Empty } from '../components/ui/bits'

export default function NotFound() {
  return (
    <Page title="ページが見つかりません">
      <div className="surface"><Empty icon={<Compass size={26} />} title="このページは存在しません" body="URLを確認するか、ホームから移動してください。" action={<Link to="/" className="font-semibold text-basil">ホームへ</Link>} /></div>
    </Page>
  )
}
