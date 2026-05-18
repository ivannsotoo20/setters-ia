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
  ChevronDown,
  User,
  CalendarDays,
  Rocket,
} from 'lucide-react';
import { FyzonLogo } from '@/components/branding/fyzon-logo';
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
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Hito 11 — Badge opcional al final del item (p.ej. "Pendiente" naranja). */
  badge?: {
    text: string;
    tone: 'orange' | 'neutral';
  };
}

interface NavGroup {
  /** Label visible como sub-header. Undefined = items sueltos sin agrupar. */
  label?: string;
  items: NavItem[];
}

type SidebarMode = 'agency' | 'tenant-admin' | 'trainer';

const NAV_TRAINER_MAIN: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/conversations', label: 'Conversaciones', icon: MessageSquare },
  { href: '/contacts', label: 'Contactos', icon: ContactRound },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/calendars', label: 'Calendarios', icon: CalendarDays },
];

/**
 * Entradas de Configuración agrupadas por sección.
 *
 * Reorganización 2026-05-16: pasamos de 11 entradas planas a 8 entradas (o 5
 * para collaborator) agrupadas en hasta 5 secciones con sub-headers visuales.
 *   - "Onboarding" eliminado: el banner sticky ya guía al trainer cuando aplica.
 *   - "Salud integraciones" fusionado como tab interna dentro de `/settings/integrations`.
 *   - "Miembros" renombrado visualmente al grupo "Equipo".
 */
function buildTrainerConfigGroups(
  canManageTenant: boolean,
  schedulingModeUnset: boolean,
  setupPendingCount: number,
): NavGroup[] {
  const groups: NavGroup[] = [];

  // Setup (Activación) — primer item destacado mientras quedan pasos pendientes.
  // Cuando setupPendingCount=0 (todos los 4 pasos hechos), seguimos mostrándolo
  // pero sin badge: el trainer puede volver a revisar/reconfigurar credenciales.
  if (canManageTenant) {
    groups.push({
      label: 'Activación',
      items: [
        {
          href: '/settings/setup',
          label: 'Setup',
          icon: Rocket,
          badge:
            setupPendingCount > 0
              ? { text: `${setupPendingCount}/4 pendiente`, tone: 'orange' as const }
              : undefined,
        },
      ],
    });
  }

  // Perfil + Integraciones — items sueltos top. Integraciones absorbe WhatsApp
  // y Salud como tabs internas (eliminamos header "Canales" — solo había 2 items).
  const topItems: NavItem[] = [
    { href: '/settings/profile', label: 'Perfil', icon: User },
  ];
  if (canManageTenant) {
    topItems.push({ href: '/settings/integrations', label: 'Integraciones', icon: Settings });
  }
  groups.push({ items: topItems });

  // Automatización — visible para todos: viewer/collaborator ven read-only.
  // "Plantillas" → "Seguimientos" (las plantillas WA migraron al tab WhatsApp
  // de Integraciones; aquí solo queda la config de seguimientos automáticos).
  groups.push({
    label: 'Automatización',
    items: [
      { href: '/keywords', label: 'Keywords', icon: Sparkles },
      { href: '/labels', label: 'Etiquetas', icon: Tag },
      { href: '/settings/followup-templates', label: 'Seguimientos', icon: Clock },
    ],
  });

  // Agenda — solo si puede gestionar (calendar OAuth + matching config).
  // Hito 11 — Añade "Modo de agendado" con badge "Pendiente" si el trainer
  // todavía no eligió direct vs link.
  if (canManageTenant) {
    groups.push({
      label: 'Agenda',
      items: [
        { href: '/settings/calendars', label: 'Calendarios', icon: CalendarDays },
        {
          href: '/settings/scheduling',
          label: 'Modo de agendado',
          icon: Clock,
          badge: schedulingModeUnset ? { text: 'Pendiente', tone: 'orange' as const } : undefined,
        },
      ],
    });
  }

  // Equipo — Miembros bajo header "Equipo" (collaborator ve read-only).
  groups.push({
    label: 'Equipo',
    items: [{ href: '/settings/members', label: 'Miembros', icon: UserCog }],
  });

  // Preferencias — solo si puede gestionar (toggles del setter).
  if (canManageTenant) {
    groups.push({
      items: [{ href: '/settings/preferences', label: 'Preferencias', icon: Sliders }],
    });
  }

  return groups;
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
  /** Hito 11 — true si el trainer aún no eligió schedulingMode → badge "Pendiente". */
  schedulingModeUnset?: boolean;
  /**
   * Hito 12.1 — Número de pasos del setup que faltan por completar (0..4).
   * Si > 0 muestra badge "N/4 pendiente" en sidebar > Configuración > Setup.
   * Si tenant ya tiene `onboarded_at != null` o todos los pasos hechos → 0.
   */
  setupPendingCount?: number;
}

export function AppSidebar({
  tenantName,
  userEmail,
  isAgencyAdmin,
  canManageTenant = true,
  memberRole = 'owner',
  impersonatingTenantName,
  schedulingModeUnset = false,
  setupPendingCount = 0,
}: Props) {
  const pathname = usePathname();
  const mode = deriveMode(pathname, isAgencyAdmin === true);
  const tenantIdInUrl = extractTenantId(pathname);
  const trainerConfigGroups = buildTrainerConfigGroups(
    canManageTenant,
    schedulingModeUnset,
    setupPendingCount,
  );

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
                <FyzonLogo variant="mark" className="size-8" />
                <div className="flex flex-col gap-0.5 leading-none min-w-0 flex-1">
                  <span className="font-semibold truncate tracking-tight">Fyzon Setters</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {subtitle}
                  </span>
                </div>
                {isAgencyAdmin ? (
                  <ShieldCheck className="size-4 text-primary shrink-0" />
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
                    groups={trainerConfigGroups}
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
        <div className="flex items-center justify-center gap-2 px-2 py-2 group-data-[collapsible=icon]:px-0">
          <FyzonLogo variant="mark" className="size-6 shrink-0" />
          <div className="flex flex-col leading-none group-data-[collapsible=icon]:hidden">
            <span className="text-xs font-semibold tracking-tight">Fyzon</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Setters · v0.1
            </span>
          </div>
        </div>
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
        <ShieldCheck className="size-4 text-primary" aria-hidden />
      </div>
    );
  }
  return (
    <div className="px-2 pt-1">
      <Badge
        variant="outline"
        className="border-primary/30 text-primary bg-primary/5 text-[10px]"
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
          {item.badge ? (
            <Badge
              variant={item.badge.tone === 'orange' ? 'default' : 'outline'}
              className={cn(
                'ml-auto text-[9px] px-1.5 h-4 group-data-[collapsible=icon]:hidden',
                item.badge.tone === 'orange'
                  ? 'bg-orange-500 text-white hover:bg-orange-500/90 border-orange-500'
                  : '',
              )}
            >
              {item.badge.text}
            </Badge>
          ) : null}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * Item colapsable "Configuración" — agrupa todos los settings del trainer
 * detrás de un único click. Inicialmente cerrado, pero si la ruta actual
 * pertenece al submenu lo abrimos automáticamente.
 *
 * Cada `NavGroup` con `label` renderiza un sub-header visual sobre sus items
 * (estilo "CANALES", "AUTOMATIZACIÓN"). Grupos sin label van como items sueltos.
 */
function ConfigCollapsibleItem({
  groups,
  pathname,
}: {
  groups: NavGroup[];
  pathname: string;
}) {
  const allItems = groups.flatMap((g) => g.items);
  const anySubActive = allItems.some((item) => isActive(pathname, item.href));
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
            {groups.map((group, gIdx) => (
              <ConfigGroupBlock
                key={group.label ?? `_g${gIdx}`}
                group={group}
                pathname={pathname}
                isFirst={gIdx === 0}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function ConfigGroupBlock({
  group,
  pathname,
  isFirst,
}: {
  group: NavGroup;
  pathname: string;
  isFirst: boolean;
}) {
  return (
    <>
      {group.label ? (
        <li
          className={cn(
            'px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 select-none',
            isFirst ? 'pt-1' : 'pt-3',
          )}
          aria-hidden
        >
          {group.label}
        </li>
      ) : null}
      {group.items.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <SidebarMenuSubItem key={item.href}>
            <SidebarMenuSubButton asChild isActive={active}>
              <Link href={item.href}>
                <Icon className="size-4" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge ? (
                  <Badge
                    variant={item.badge.tone === 'orange' ? 'default' : 'outline'}
                    className={cn(
                      'text-[9px] px-1.5 h-4 shrink-0',
                      item.badge.tone === 'orange'
                        ? 'bg-orange-500 text-white hover:bg-orange-500/90 border-orange-500'
                        : '',
                    )}
                  >
                    {item.badge.text}
                  </Badge>
                ) : null}
              </Link>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        );
      })}
    </>
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
