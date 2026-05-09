'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  LayoutDashboard,
  MessageSquare,
  Sparkles,
  Settings,
  LogOut,
  Bot,
  Users,
  ShieldCheck,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { logout } from '@/lib/actions/auth';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_MAIN: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/conversations', label: 'Conversaciones', icon: MessageSquare },
];

const NAV_CONFIG: NavItem[] = [
  { href: '/keywords', label: 'Keywords', icon: Sparkles },
  { href: '/settings/integrations', label: 'Integraciones', icon: Settings },
];

const NAV_AGENCY: NavItem[] = [
  { href: '/admin/dashboard', label: 'Resumen agencia', icon: Building2 },
  { href: '/admin/tenants', label: 'Sub-cuentas', icon: Users },
];

interface Props {
  tenantName?: string | null;
  userEmail?: string | null;
  isAgencyAdmin?: boolean;
  impersonatingTenantName?: string | null;
}

export function AppSidebar({
  tenantName,
  userEmail,
  isAgencyAdmin,
  impersonatingTenantName,
}: Props) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={isAgencyAdmin ? '/admin/dashboard' : '/dashboard'}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Bot className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none min-w-0 flex-1">
                  <span className="font-semibold truncate">Fyzon Setters</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {impersonatingTenantName
                      ? `Viendo: ${impersonatingTenantName}`
                      : tenantName ?? 'Sin tenant'}
                  </span>
                </div>
                {isAgencyAdmin ? (
                  <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
                ) : null}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {isAgencyAdmin ? (
          <div className="px-2 pt-1">
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/5 text-[10px]">
              <ShieldCheck className="size-2.5 mr-1" />
              Agencia
            </Badge>
          </div>
        ) : null}
      </SidebarHeader>
      <SidebarContent>
        {isAgencyAdmin ? (
          <SidebarGroup>
            <SidebarGroupLabel>Agencia</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_AGENCY.map((item) => (
                  <NavItemRow
                    key={item.href}
                    item={item}
                    active={isActive(pathname, item.href)}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SidebarGroup>
          <SidebarGroupLabel>Operación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_MAIN.map((item) => (
                <NavItemRow
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Configuración</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_CONFIG.map((item) => (
                <NavItemRow
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {userEmail ? (
            <SidebarMenuItem>
              <div className="px-2 py-1 text-xs text-muted-foreground truncate">
                {userEmail}
              </div>
            </SidebarMenuItem>
          ) : null}
          <SidebarMenuItem>
            <form action={logout} className="w-full">
              <SidebarMenuButton type="submit" className="w-full justify-start">
                <LogOut className="size-4" />
                <span>Cerrar sesión</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavItemRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link href={item.href}>
          <Icon className="size-4" />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}
