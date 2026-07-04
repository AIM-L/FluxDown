import 'package:flutter/widgets.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../../i18n/locale_provider.dart';
import '../../models/download_controller.dart';
import '../../models/download_task.dart';
import '../../models/settings_provider.dart';
import '../../theme/app_colors.dart';
import '../mobile_ui.dart';
import '../pages/mobile_task_detail_page.dart';
import '../sheets/mobile_filter_sheet.dart';
import '../sheets/mobile_new_download_sheet.dart';
import '../sheets/mobile_task_action_sheet.dart';

/// 首页：任务列表（顶栏 + 状态 Tab + 时间分组列表 + FAB）
class MobileTasksScreen extends StatefulWidget {
  final DownloadController controller;
  final SettingsProvider settings;

  const MobileTasksScreen({
    super.key,
    required this.controller,
    required this.settings,
  });

  @override
  State<MobileTasksScreen> createState() => MobileTasksScreenState();
}

class MobileTasksScreenState extends State<MobileTasksScreen> {
  bool _searching = false;
  String _query = '';
  final _searchController = TextEditingController();
  final _searchFocus = FocusNode();

  @override
  void dispose() {
    _searchController.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  void _toggleSearch() {
    setState(() {
      _searching = !_searching;
      if (_searching) {
        _searchFocus.requestFocus();
      } else {
        _searchController.clear();
        _query = '';
      }
    });
  }

  /// 全局暂停 / 恢复
  void _toggleGlobalPause() {
    final s = LocaleScope.of(context);
    final c = widget.controller;
    final hasActive = c.activeCount > 0;
    if (hasActive) {
      c.pauseAll();
      showMobileToast(context, s.mobilePausedAllToast);
    } else {
      c.resumeAll();
      showMobileToast(context, s.mobileResumedAllToast);
    }
  }

  void _openDetail(DownloadTask task) {
    Navigator.of(context).push(
      PageRouteBuilder<void>(
        transitionDuration: const Duration(milliseconds: 280),
        reverseTransitionDuration: const Duration(milliseconds: 240),
        pageBuilder: (_, _, _) => MobileTaskDetailPage(
          controller: widget.controller,
          taskId: task.id,
        ),
        transitionsBuilder: (_, anim, _, child) {
          final curved = CurvedAnimation(
            parent: anim,
            curve: const Cubic(0.32, 0.72, 0.32, 1),
          );
          return SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(1, 0),
              end: Offset.zero,
            ).animate(curved),
            child: child,
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final s = LocaleScope.of(context);
    final topInset = MediaQuery.paddingOf(context).top;
    final headerHeight =
        topInset + MobileDims.appBarHeight + MobileDims.tabsHeight;

    return Stack(
      children: [
        // 任务列表（滚动到顶栏之下）
        Positioned.fill(
          child: ListenableBuilder(
            listenable: widget.controller,
            builder: (context, _) {
              final groups = _visibleGroups();
              if (groups.isEmpty) {
                return Padding(
                  padding: EdgeInsets.only(top: headerHeight),
                  child: _EmptyState(label: s.emptyTitle),
                );
              }
              return ListView.builder(
                padding: EdgeInsets.fromLTRB(
                  MobileDims.pageMargin,
                  headerHeight + 8,
                  MobileDims.pageMargin,
                  MobileDims.scrollBottomPadding,
                ),
                itemCount: _countRows(groups),
                itemBuilder: (context, index) =>
                    _buildRow(context, groups, index),
              );
            },
          ),
        ),

        // 玻璃顶栏 + 状态 Tabs
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: ClipRect(
            child: BackdropFilter(
              filter: mobileBlurFilter,
              child: Container(
                color: c.bg.withValues(alpha: 0.72),
                padding: EdgeInsets.only(top: topInset),
                child: Column(
                  children: [
                    SizedBox(
                      height: MobileDims.appBarHeight,
                      child: _buildAppBar(context),
                    ),
                    SizedBox(
                      height: MobileDims.tabsHeight,
                      child: _buildTabs(context),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),

        // FAB
        Positioned(
          right: MobileDims.pageMargin,
          bottom: 86,
          child: GestureDetector(
            onTap: () => showMobileNewDownloadSheet(
              context,
              controller: widget.controller,
              settings: widget.settings,
            ),
            child: Container(
              width: MobileDims.fabSize,
              height: MobileDims.fabSize,
              decoration: BoxDecoration(
                color: c.accent,
                shape: BoxShape.circle,
                border: Border.all(
                  color: const Color(0xFFFFFFFF).withValues(alpha: 0.28),
                ),
                boxShadow: [
                  BoxShadow(
                    color: c.accent.withValues(alpha: 0.35),
                    blurRadius: 20,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Icon(LucideIcons.plus, size: 20, color: c.accentForeground),
            ),
          ),
        ),
      ],
    );
  }

  // ── 顶栏 ──

  Widget _buildAppBar(BuildContext context) {
    final c = AppColors.of(context);
    final s = LocaleScope.of(context);

    if (_searching) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
        child: Row(
          children: [
            Expanded(
              child: MobileTextField(
                controller: _searchController,
                focusNode: _searchFocus,
                placeholder: s.mobileSearchHint,
                dense: true,
                onChanged: (v) =>
                    setState(() => _query = v.trim().toLowerCase()),
              ),
            ),
            MobileIconButton(icon: LucideIcons.x, onTap: _toggleSearch),
          ],
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(left: 16, right: 8),
      child: Row(
        children: [
          // Logo + 全局速度
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: c.accent,
              borderRadius: BorderRadius.circular(9),
            ),
            child: Icon(
              LucideIcons.arrowDownToLine,
              size: 19,
              color: c.accentForeground,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: ListenableBuilder(
              listenable: widget.controller,
              builder: (context, _) {
                final dc = widget.controller;
                final downloading = dc.downloadingCount;
                final text = downloading > 0
                    ? s.mobileSpeedSummary(
                        '${DownloadTask.formatBytes(dc.totalDownloadSpeed)}/s',
                        downloading,
                      )
                    : s.mobileIdleSummary;
                return Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'FluxDown',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: c.textPrimary,
                      ),
                    ),
                    Text(
                      text,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11, color: c.textSecondary),
                    ),
                  ],
                );
              },
            ),
          ),
          MobileIconButton(icon: LucideIcons.search, onTap: _toggleSearch),
          ListenableBuilder(
            listenable: widget.controller,
            builder: (context, _) {
              final dc = widget.controller;
              final filtered =
                  dc.categoryFilter != FileCategory.all ||
                  dc.customCategoryFilter != null ||
                  dc.queueFilter != null;
              return MobileIconButton(
                icon: LucideIcons.settings2,
                showDot: filtered,
                onTap: () => showMobileFilterSheet(context, dc),
              );
            },
          ),
          ListenableBuilder(
            listenable: widget.controller,
            builder: (context, _) {
              final hasActive = widget.controller.activeCount > 0;
              return MobileIconButton(
                icon: hasActive ? LucideIcons.pause : LucideIcons.play,
                onTap: _toggleGlobalPause,
              );
            },
          ),
        ],
      ),
    );
  }

  // ── 状态 Tabs ──

  Widget _buildTabs(BuildContext context) {
    final s = LocaleScope.of(context);
    return ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final dc = widget.controller;
        String label(StatusTab tab) => switch (tab) {
          StatusTab.all => s.tabAll,
          StatusTab.downloading => s.tabDownloading,
          StatusTab.completed => s.tabCompleted,
          StatusTab.paused => s.tabPaused,
          StatusTab.error => s.tabError,
        };
        return ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
          children: [
            for (final tab in StatusTab.values) ...[
              Center(
                child: MobileChip(
                  label:
                      '${label(tab)} ${dc.filteredCountForStatus(tab)}',
                  selected: dc.statusTab == tab,
                  onTap: () => dc.setStatusTab(tab),
                ),
              ),
              const SizedBox(width: 6),
            ],
          ],
        );
      },
    );
  }

  // ── 列表 ──

  List<TaskGroup> _visibleGroups() {
    final groups = widget.controller.groupedTasks;
    if (_query.isEmpty) return groups;
    final filtered = <TaskGroup>[];
    for (final g in groups) {
      final tasks = g.tasks
          .where((t) => t.fileName.toLowerCase().contains(_query))
          .toList();
      if (tasks.isNotEmpty) {
        filtered.add(TaskGroup(group: g.group, tasks: tasks));
      }
    }
    return filtered;
  }

  int _countRows(List<TaskGroup> groups) {
    var count = 0;
    for (final g in groups) {
      count += 1 + g.tasks.length;
    }
    return count;
  }

  Widget _buildRow(BuildContext context, List<TaskGroup> groups, int index) {
    final s = LocaleScope.of(context);
    final c = AppColors.of(context);
    var cursor = index;
    for (final g in groups) {
      if (cursor == 0) {
        // 分组标题
        return Padding(
          padding: const EdgeInsets.fromLTRB(4, 12, 4, 8),
          child: Text(
            g.isActiveGroup ? s.activeGroupLabel : g.group!.label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: c.textMuted,
              letterSpacing: 0.5,
            ),
          ),
        );
      }
      cursor -= 1;
      if (cursor < g.tasks.length) {
        final task = g.tasks[cursor];
        return _MobileTaskCard(
          task: task,
          controller: widget.controller,
          onTap: () => _openDetail(task),
          onLongPress: () =>
              showMobileTaskActionSheet(context, widget.controller, task),
        );
      }
      cursor -= g.tasks.length;
    }
    return const SizedBox.shrink();
  }
}

// ─────────────────────────────────────────────
// 任务卡片
// ─────────────────────────────────────────────

class _MobileTaskCard extends StatelessWidget {
  final DownloadTask task;
  final DownloadController controller;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  const _MobileTaskCard({
    required this.task,
    required this.controller,
    required this.onTap,
    required this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final boosted = controller.priorityTaskId == task.id;
    final showBar =
        task.status == TaskStatus.downloading ||
        task.status == TaskStatus.paused ||
        task.status == TaskStatus.error ||
        task.status == TaskStatus.preparing ||
        task.status == TaskStatus.resuming;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      onLongPress: onLongPress,
      child: Container(
        margin: const EdgeInsets.only(bottom: MobileDims.cardGap),
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
        decoration: mobileCardDecoration(c),
        child: Row(
          children: [
            // 文件图标
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: c.surface2,
                borderRadius: BorderRadius.circular(11),
                border: Border.all(color: c.border),
              ),
              child: Icon(
                mobileCategoryIcon(task.fileCategory),
                size: 20,
                color: c.textSecondary,
              ),
            ),
            const SizedBox(width: 12),
            // 主体
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (boosted) ...[
                        Icon(
                          LucideIcons.zap,
                          size: 13,
                          color: c.statusWarning,
                        ),
                        const SizedBox(width: 5),
                      ],
                      Expanded(
                        child: Text(
                          task.fileName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            color: c.textPrimary,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 5),
                  _MetaLine(task: task),
                  if (showBar) ...[
                    const SizedBox(height: 7),
                    MobileProgressBar(
                      progress: task.isIndeterminate ? 1.0 : task.progress,
                      color: switch (task.status) {
                        TaskStatus.paused => c.statusWarning,
                        TaskStatus.error => c.statusError,
                        _ => c.accent,
                      },
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 10),
            _ActionButton(task: task, controller: controller),
          ],
        ),
      ),
    );
  }
}

/// 卡片元信息行：协议徽标 + 状态相关文本
class _MetaLine extends StatelessWidget {
  final DownloadTask task;

  const _MetaLine({required this.task});

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final s = LocaleScope.of(context);
    final base = TextStyle(fontSize: 11.5, color: c.textSecondary);

    final spans = <InlineSpan>[];
    void sep() => spans.add(
      TextSpan(
        text: ' · ',
        style: base.copyWith(color: c.textMuted),
      ),
    );

    switch (task.status) {
      case TaskStatus.downloading:
        spans.add(
          TextSpan(text: '${task.downloadedText} / ${task.sizeText}'),
        );
        sep();
        spans.add(
          TextSpan(
            text: task.speedText,
            style: base.copyWith(
              color: c.accent,
              fontWeight: FontWeight.w600,
            ),
          ),
        );
        if (task.etaText != '—') {
          sep();
          spans.add(TextSpan(text: task.etaText));
        }
      case TaskStatus.paused:
        spans.add(
          TextSpan(text: '${task.downloadedText} / ${task.sizeText}'),
        );
        sep();
        spans.add(
          TextSpan(
            text: s.statusPaused,
            style: base.copyWith(color: c.statusWarning),
          ),
        );
      case TaskStatus.completed:
        spans.add(
          TextSpan(
            text: s.statusCompleted,
            style: base.copyWith(color: c.statusSuccess),
          ),
        );
        sep();
        spans.add(TextSpan(text: task.sizeText));
      case TaskStatus.error:
        spans.add(
          TextSpan(
            text: task.errorMessage.isEmpty
                ? s.subtitleError
                : task.errorMessage,
            style: base.copyWith(color: c.statusError),
          ),
        );
      case TaskStatus.pending:
        spans.add(
          TextSpan(
            text: task.queuePosition > 0
                ? '${s.statusPending} · ${s.subtitleQueued(task.queuePosition)}'
                : s.statusPending,
          ),
        );
      case TaskStatus.preparing:
      case TaskStatus.resuming:
        spans.add(TextSpan(text: task.statusText));
    }

    return Row(
      children: [
        // 协议徽标
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
          decoration: BoxDecoration(
            color: c.hoverBg,
            borderRadius: BorderRadius.circular(5),
            border: Border.all(color: c.border),
          ),
          child: Text(
            task.protocolLabel,
            style: TextStyle(
              fontSize: 9.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
              color: c.textSecondary,
            ),
          ),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text.rich(
            TextSpan(style: base, children: spans),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

/// 卡片右侧操作按钮（暂停 ⇄ 继续 / 重试 / 完成对勾）
class _ActionButton extends StatelessWidget {
  final DownloadTask task;
  final DownloadController controller;

  const _ActionButton({required this.task, required this.controller});

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    if (task.status == TaskStatus.completed) {
      return Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: c.statusSuccess.withValues(alpha: 0.12),
          shape: BoxShape.circle,
        ),
        child: Icon(LucideIcons.check, size: 14, color: c.statusSuccess),
      );
    }

    final (IconData icon, Color color, Color borderColor) =
        switch (task.status) {
          TaskStatus.error => (
            LucideIcons.rotateCcw,
            c.statusError,
            c.statusError.withValues(alpha: 0.35),
          ),
          TaskStatus.paused || TaskStatus.pending => (
            LucideIcons.play,
            c.textPrimary,
            c.border,
          ),
          _ => (LucideIcons.pause, c.textPrimary, c.border),
        };

    return GestureDetector(
      onTap: () => toggleMobileTask(controller, task),
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: c.surface1,
          border: Border.all(color: borderColor),
        ),
        child: Icon(icon, size: 14, color: color),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final String label;

  const _EmptyState({required this.label});

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            LucideIcons.download,
            size: 44,
            color: c.textMuted.withValues(alpha: 0.4),
          ),
          const SizedBox(height: 12),
          Text(label, style: TextStyle(fontSize: 13, color: c.textMuted)),
        ],
      ),
    );
  }
}
