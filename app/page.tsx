import AppShell from '@/components/AppShell'

export default function Page({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const mock = searchParams?.mock === '1'
  return <AppShell forceMock={mock} />
}
