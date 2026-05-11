'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  LayoutDashboard,
  MessageSquare,
  Sparkles,
  Settings,
  Sliders,
  LogOut,
  Bot,
  Brain,
  Users,
  ShieldCheck,
  ArrowLeft,
  ClipboardList,
  Receipt,
  UserCog,
  Tag,
  Kanban,
  Clock,
  ContactRound,
  Activity,
  Rocket,
  MessageCircle,
  ChevronDown,
  User,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { logout } from '@/lib/actions/auth';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

type SidebarMode = 'agency' | 'tenant-admin' | 'trainer';

const NAV_TRAINER_MAIN: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/conversations', label: 'Conversaciones', icon: MessageSquare },
  { href: '/contacts', label: 'Contactos', icon: ContactRound },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban },
];

/** Entradas de configuración visibles según rol. */
function buildTrainerConfigNav(canManageTenant: boolean): NavItem[] {
  // Perfil siempre primero — accesible para todos los roles.
  const items: NavItem[] = [
    { href: '/settings/profile', label: 'Perfil', icon: User },
    { href: '/keywords', label: 'Keywords', icon: Sparkles },
    { href: '/labels', label: 'Etiquetas', icon: Tag },
    { href: '/settings/followup-templates', label: 'Followups', icon: Clock },
  ];
  if (canManageTenant) {
    items.push({ href: '/settings/whatsapp', label: 'WhatsApp', icon: MessageCircle });
    items.push({ href: '/onboarding/integrations', label: 'Onboarding', icon: Rocket });
    items.push({ href: '/settings/integrations', label: 'Integraciones', icon: Settings });
    items.push({ href: '/settings/integrations/health', label: 'Salud integraciones', icon: Activity });
    items.push({ href: '/settings/preferences', label: 'Preferencias', icon: Sliders });
  }
  // Miembros visible para todos: collaborator ve la lista en read-only.
  items.push({ href: '/settings/members', label: 'Miembros', icon: UserCog });
  return items;
}

const NAV_AGENCY: NavItem[] = [
  { href: '/admin/dashboard', label: 'Resumen agencia', icon: Building2 },
  { href: '/admin/tenants', label: 'Sub-cuentas', icon: Users },
  { href: '/admin/admins', label: 'Admins Fyzon', icon: ShieldCheck },
  { href: '/admin/cerebro', label: 'Cerebro (prompt)', icon: Brain },
];

function buildTenantAdminNav(tenantId: string | number): NavItem[] {
  const base = `/admin/tenants/${tenantId}`;
  return [
    { href: base, label: 'Resumen', icon: LayoutDashboard },
    { href: `${base}/members`, label: 'Miembros', icon: UserCog },
    { href: `${base}/audit`, label: 'Auditoría', icon: ClipboardList },
    { href: `${base}/billing`, label: 'Facturación', icon: Receipt },
  ];
}

/**
 * Deriva el modo de sidebar según pathname + flag agency admin.
 *
 * - `agency`: agency admin en `/admin/dashboard|tenants|cerebro|settings`.
 *   NO en `/admin/tenants/[id]/...`, eso es tenant-admin.
 * - `tenant-admin`: agency admin en `/admin/tenants/[id]/...`.
 * - `trainer`: cualquier otra ruta (dashboard, conversations, keywords,
 *   settings/*). Tanto trainer normal como agency admin impersonando.
 */
function deriveMode(pathname: string, isAgencyAdmin: boolean): SidebarMode {
  if (!isAgencyAdmin) return 'trainer';
  const tenantMatch = /^\/admin\/tenants\/(\d+)(\/|$)/.exec(pathname);
  if (tenantMatch) return 'tenant-admin';
  if (pathname.startsWith('/admin/')) return 'agency';
  return 'trainer';
}

function extractTenantId(pathname: string): string | null {
  const m = /^\/admin\/tenants\/(\d+)(\/|$)/.exec(pathname);
  return m && m[1] ? m[1] : null;
}

interface Props {
  tenantName?: string | null;
  userEmail?: string | null;
  isAgencyAdmin?: boolean;
  /** Owner del tenant O agency admin → puede modificar config sensible. */
  canManageTenant?: boolean;
  /** Rol del profile en su tenant natural — usado para hints UX. */
  memberRole?: 'owner' | 'admin' | 'viewer';
  impersonatingTenantName?: string | null;
}

export function AppSidebar({
  tenantName,
  userEmail,
  isAgencyAdmin,
  canManageTenant = true,
  memberRole = 'owner',
  impersonatingTenantName,
}: Props) {
  const pathname = usePathname();
  const mode = deriveMode(pathname, isAgencyAdmin === true);
  const tenantIdInUrl = extractTenantId(pathname);
  const trainerConfigNav = buildTrainerConfigNav(canManageTenant);

  const homeHref =
    mode === 'agency' || mode === 'tenant-admin'
      ? '/admin/dashboard'
      : '/dashboard';

  const subtitle =
    impersonatingTenantName !== null && impersonatingTenantName !== undefined
      ? `Viendo: ${impersonatingTenantName}`
      : mode === 'agency'
        ? 'Modo agencia'
        : tenantName ?? 'Sin tenant';

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={homeHref}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground shrink-0">
                  <Bot className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none min-w-0 flex-1">
                  <span className="font-semibold truncate">Fyzon Setters</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {subtitle}
                  </span>
                </div>
                {isAgencyAdmin ? (
                  <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
                ) : null}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {isAgencyAdmin && mode === 'agency' ? <AgencyBadge /> : null}
      </SidebarHeader>
      <SidebarContent>
        {mode === 'agency' ? (
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

        {mode === 'tenant-admin' && tenantIdInUrl ? (
          <>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Volver a Sub-cuentas">
                      <Link href="/admin/tenants">
                        <ArrowLeft className="size-4" />
                        <span>Sub-cuentas</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Sub-cuenta</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {buildTenantAdminNav(tenantIdInUrl).map((item) => (
                    <NavItemRow
                      key={item.href}
                      item={item}
                      active={isExactActive(pathname, item.href)}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : null}

        {mode === 'trainer' ? (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Operación</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV_TRAINER_MAIN.map((item) => (
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
              <SidebarGroupContent>
                <SidebarMenu>
                  <ConfigCollapsibleItem
                    items={trainerConfigNav}
                    pathname={pathname}
                  />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {!canManageTenant && memberRole !== 'owner' ? (
              <SidebarGroup>
                <SidebarGroupContent>
                  <div className="px-2 pt-2 text-[10px] text-muted-foreground leading-tight">
                    Acceso de colaborador. Solo el owner puede editar prompts,
                    integraciones y preferencias.
                  </div>
                </SidebarGroupContent>
              </SidebarGroup>
            ) : null}
          </>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {userEmail ? (
            <SidebarMenuItem>
              <div className="px-2 py-1 text-xs text-muted-foreground truncate group-data-[collapsible=icon]:hidden">
                {userEmail}
              </div>
            </SidebarMenuItem>
          ) : null}
          <SidebarMenuItem>
            <form action={logout} className="w-full">
              <SidebarMenuButton type="submit" tooltip="Cerrar sesión" className="w-full justify-start">
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

/**
 * Badge "Agencia" adaptativo: full label cuando expanded, icon-only cuando
 * collapsed (evita overflow del badge en sidebar colapsado).
 */
function AgencyBadge() {
  const { state } = useSidebar();
  if (state === 'collapsed') {
    return (
      <div className="flex justify-center pt-1" aria-label="Modo Agencia">
        <ShieldCheck className="size-4 text-emerald-400" aria-hidden />
      </div>
    );
  }
  return (
    <div className="px-2 pt-1">
      <Badge
        variant="outline"
        className="border-emerald-500/40 text-emerald-400 bg-emerald-500/5 text-[10px]"
      >
        <ShieldCheck className="size-2.5 mr-1" />
        Agencia
      </Badge>
    </div>
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

/**
 * Item colapsable "Configuración" — agrupa todos los settings del trainer
 * detrás de un único click. Inicialmente cerrado, pero si la ruta actual
 * pertenece al submenu lo abrimos automáticamente.
 */
function ConfigCollapsibleItem({
  items,
  pathname,
}: {
  items: NavItem[];
  pathname: string;
}) {
  const anySubActive = items.some((item) => isActive(pathname, item.href));
  return (
    <Collapsible defaultOpen={anySubActive} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip="Configuración">
            <Settings className="size-4" />
            <span>Configuración</span>
            <ChevronDown className="ml-auto size-4 transition-transform duration-150 group-data-[state=open]/collapsible:rotate-180" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <SidebarMenuSubItem key={item.href}>
                  <SidebarMenuSubButton asChild isActive={active}>
                    <Link href={item.href}>
                      <Icon className="size-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Match exacto: usado para tenant-admin sub-routes donde "Resumen" es la base
 * y los sub-items NO deben activar también "Resumen".
 */
function isExactActive(pathname: string, href: string): boolean {
  return pathname === href;
}
