import { Skeleton } from '../ui/bits'

export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-[960px] px-4 pt-6 sm:px-6 lg:px-10 lg:pt-10" aria-busy="true" aria-label="読み込み中">
      <Skeleton className="mb-2 h-8 w-40" />
      <Skeleton className="mb-6 h-4 w-56" />
      <Skeleton className="mb-3 h-36 w-full rounded-[18px]" />
      <Skeleton className="mb-3 h-20 w-full rounded-[18px]" />
      <Skeleton className="h-20 w-full rounded-[18px]" />
    </div>
  )
}
