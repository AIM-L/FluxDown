import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../../i18n/locale_provider.dart';
import '../../models/download_controller.dart';
import '../../models/download_task.dart';
import '../../theme/app_colors.dart';
import '../mobile_ui.dart';

/// 任务动作面板（长按卡片 / 详情页「⋯」唤起）
Future<void> showMobileTaskActionSheet(
  BuildContext context,
  DownloadController controller,
  DownloadTask task,
) {
  return showMobileSheet<void>(
    context,
    builder: (ctx) {
      final s = LocaleScope.of(ctx);
      final c = AppColors.of(ctx);
      final boosted = controller.priorityTaskId == task.id;

      final (IconData toggleIcon, String toggleLabel) = switch (task.status) {
        TaskStatus.downloading ||
        TaskStatus.preparing ||
        TaskStatus.resuming => (LucideIcons.pause, s.pause),
        TaskStatus.error => (LucideIcons.rotateCcw, s.mobileRetry),
        _ => (LucideIcons.play, s.resume),
      };

      Widget item({
        required IconData icon,
        required String label,
        required VoidCallback onTap,
        bool danger = false,
      }) {
        final color = danger ? c.statusError : null;
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
            child: Row(
              children: [
                Icon(icon, size: 18, color: color ?? c.textSecondary),
                const SizedBox(width: 14),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 14,
                    color: color ?? c.textPrimary,
                  ),
                ),
              ],
            ),
          ),
        );
      }

      return MobileSheetContainer(
        title: task.fileName,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (task.status != TaskStatus.completed)
              item(
                icon: toggleIcon,
                label: toggleLabel,
                onTap: () {
                  Navigator.of(ctx).pop();
                  _toggleTask(controller, task);
                },
              ),
            if (task.status != TaskStatus.completed)
              item(
                icon: LucideIcons.zap,
                label: boosted ? s.cancelBoost : s.mobileBoostAction,
                onTap: () {
                  Navigator.of(ctx).pop();
                  controller.setPriorityTask(boosted ? '' : task.id);
                  showMobileToast(
                    context,
                    boosted ? s.mobileBoostOff : s.mobileBoostOn,
                  );
                },
              ),
            item(
              icon: LucideIcons.copy,
              label: s.copyUrl,
              onTap: () {
                Navigator.of(ctx).pop();
                Clipboard.setData(ClipboardData(text: task.url));
                showMobileToast(context, s.urlCopied);
              },
            ),
            item(
              icon: LucideIcons.layers,
              label: s.mobileMoveToQueue,
              onTap: () {
                Navigator.of(ctx).pop();
                _showMoveToQueueSheet(context, controller, task);
              },
            ),
            item(
              icon: LucideIcons.trash2,
              label: s.deleteTask,
              danger: true,
              onTap: () {
                Navigator.of(ctx).pop();
                confirmMobileDeleteTask(
                  context,
                  controller,
                  task,
                  deleteFiles: false,
                );
              },
            ),
            item(
              icon: LucideIcons.trash2,
              label: s.deleteTaskAndFile,
              danger: true,
              onTap: () {
                Navigator.of(ctx).pop();
                confirmMobileDeleteTask(
                  context,
                  controller,
                  task,
                  deleteFiles: true,
                );
              },
            ),
          ],
        ),
      );
    },
  );
}

/// 暂停 ⇄ 继续 / 重试。列表卡片按钮和动作面板共用。
void _toggleTask(DownloadController controller, DownloadTask task) {
  switch (task.status) {
    case TaskStatus.downloading:
    case TaskStatus.preparing:
    case TaskStatus.resuming:
      controller.pauseTask(task.id);
    case TaskStatus.paused:
    case TaskStatus.pending:
    case TaskStatus.error:
      controller.resumeTask(task.id);
    case TaskStatus.completed:
      break;
  }
}

/// 供列表卡片直接调用的暂停/继续切换
void toggleMobileTask(DownloadController controller, DownloadTask task) =>
    _toggleTask(controller, task);

Future<void> _showMoveToQueueSheet(
  BuildContext context,
  DownloadController controller,
  DownloadTask task,
) {
  return showMobileSheet<void>(
    context,
    builder: (ctx) {
      final s = LocaleScope.of(ctx);
      final c = AppColors.of(ctx);

      Widget queueItem(String id, String name) {
        final selected = task.queueId == id;
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () {
            Navigator.of(ctx).pop();
            if (!selected) {
              controller.moveTaskToQueue(task.id, id);
              showMobileToast(context, s.mobileMovedToQueue);
            }
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
            child: Row(
              children: [
                Icon(
                  selected ? LucideIcons.circleCheck : LucideIcons.circle,
                  size: 17,
                  color: selected ? c.accent : c.textMuted,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, color: c.textPrimary),
                  ),
                ),
              ],
            ),
          ),
        );
      }

      return MobileSheetContainer(
        title: s.mobileSelectQueue,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            queueItem('', s.defaultQueue),
            for (final q in controller.queues) queueItem(q.queueId, q.name),
          ],
        ),
      );
    },
  );
}

/// 删除确认对话框（任务 / 任务+文件）
Future<void> confirmMobileDeleteTask(
  BuildContext context,
  DownloadController controller,
  DownloadTask task, {
  required bool deleteFiles,
}) async {
  final s = LocaleScope.of(context);
  final confirmed = await showMobileConfirm(
    context,
    title: s.deleteConfirmTitle(deleteFiles),
    message: s.deleteConfirmDesc(task.fileName, deleteFiles),
    confirmLabel: s.confirm,
    cancelLabel: s.cancel,
    confirmIcon: LucideIcons.trash2,
    destructive: true,
  );
  if (confirmed != true) return;
  controller.deleteTask(task.id, deleteFiles: deleteFiles);
  if (context.mounted) {
    showMobileToast(
      context,
      deleteFiles ? s.mobileTaskFileDeleted : s.mobileTaskDeleted,
    );
  }
}
