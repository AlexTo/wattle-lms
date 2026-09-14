/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Link } from '@tanstack/react-router';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@wattle/common-shadcn/components/ui/sidebar';
import { BarChart3, BookOpen, Home } from 'lucide-react';

import Config from '../config';

export function AppSidebar() {
  // Menu items.
  const navItems = [
    {
      label: 'Home',
      to: '/dashboard',
      icon: Home,
    },
    {
      label: 'My Courses',
      to: '/my-courses',
      icon: BookOpen,
    },
    {
      label: 'Analytics',
      to: '/analytics',
      icon: BarChart3,
    },
  ];
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{Config.applicationName}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton asChild>
                    <Link to={item.to} preload="intent">
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
