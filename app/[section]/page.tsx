import { notFound } from 'next/navigation'
import AdminApp from '@/components/admin-app'

const sections = ['dashboard', 'products', 'orders', 'dealers', 'services', 'customers', 'settings', 'automation']

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!sections.includes(section)) notFound()
  return <AdminApp section={section} />
}
