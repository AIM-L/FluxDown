//! WS 广播中枢 + 引擎事件/选择接口的服务器端实现。
//!
//! - [`EngineEventSink`]：`EngineEvent` → [`WsServerMsg`] → JSON →
//!   `broadcast::Sender` fan-out（非阻塞，满足 `EventSink` 的禁阻塞契约）。
//! - [`WsHostSelection`]：HLS/BT 选择请求经 WS 广播给全部客户端，用
//!   oneshot 等待表接收任一客户端的应答（镜像
//!   `hub/src/rinf_selection.rs` 的桌面实现）。

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use fluxdown_engine::events::{EngineEvent, EventSink};
use fluxdown_engine::log_info;
use fluxdown_engine::model::{BtFileEntry, HlsQualityOption};
use fluxdown_engine::selection::{HostSelection, SelectionOutcome};
use tokio::sync::{broadcast, oneshot};

use crate::wire::WsServerMsg;

/// 无客户端应答时 BT 文件选择的兜底超时（与桌面端常量一致）。
const BT_SELECTION_TIMEOUT: Duration = Duration::from_secs(60);

/// WS 广播中枢：事件出站通道 + HLS/BT 选择等待表。
pub struct WsHub {
    /// 序列化后的 [`WsServerMsg`] JSON 广播通道；每个 WS 连接 subscribe 一份。
    pub events: broadcast::Sender<String>,
    pending_hls: Mutex<HashMap<String, oneshot::Sender<i32>>>,
    pending_bt: Mutex<HashMap<String, oneshot::Sender<Vec<i32>>>>,
}

impl WsHub {
    pub fn new(capacity: usize) -> Self {
        let (events, _) = broadcast::channel(capacity);
        Self {
            events,
            pending_hls: Mutex::new(HashMap::new()),
            pending_bt: Mutex::new(HashMap::new()),
        }
    }

    /// 序列化并广播一条服务端消息。无订阅者时静默丢弃（正常情形）。
    pub fn broadcast(&self, msg: &WsServerMsg) {
        match serde_json::to_string(msg) {
            Ok(json) => {
                let _ = self.events.send(json);
            }
            Err(e) => log_info!("[ws-hub] serialize failed: {}", e),
        }
    }
}

/// 取出锁内容，`Mutex` 中毒时回退到内部值（防御性处理，避免 panic）。
fn lock_or_recover<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

/// `EngineEvent` → WS 广播的 [`EventSink`] 实现。
pub struct EngineEventSink(pub std::sync::Arc<WsHub>);

impl EventSink for EngineEventSink {
    fn emit(&self, event: EngineEvent) {
        let msg = match event {
            EngineEvent::TaskProgress {
                task_id,
                status,
                downloaded_bytes,
                total_bytes,
                speed,
                file_name,
                save_dir,
                url,
                error_message,
            } => WsServerMsg::TaskProgress {
                task_id,
                status,
                downloaded_bytes,
                total_bytes,
                speed,
                file_name,
                save_dir,
                url,
                error_message,
            },
            EngineEvent::TasksSnapshot(tasks) => WsServerMsg::TasksSnapshot {
                tasks: tasks.into_iter().map(Into::into).collect(),
            },
            EngineEvent::SegmentProgress {
                task_id,
                total_bytes,
                segment_count,
                segments,
            } => WsServerMsg::SegmentProgress {
                task_id,
                total_bytes,
                segment_count,
                segments: segments.into_iter().map(Into::into).collect(),
            },
            EngineEvent::TaskMetaProbed {
                task_id,
                file_name,
                total_bytes,
            } => WsServerMsg::TaskMetaProbed {
                task_id,
                file_name,
                total_bytes,
            },
            EngineEvent::QueuePositionsChanged(positions) => WsServerMsg::QueuePositionsChanged {
                positions: positions.into_iter().map(Into::into).collect(),
            },
            EngineEvent::QueuesChanged(queues) => WsServerMsg::QueuesChanged {
                queues: queues.into_iter().map(Into::into).collect(),
            },
            EngineEvent::PriorityTaskChanged {
                priority_task_id,
                auto_paused_count,
            } => WsServerMsg::PriorityTaskChanged {
                priority_task_id,
                auto_paused_count,
            },
            EngineEvent::SegmentSplit {
                task_id,
                parent_index,
                parent_new_end,
                child_index,
                child_start,
                child_end,
                is_proactive,
                total_segments,
            } => WsServerMsg::SegmentSplit {
                task_id,
                parent_index,
                parent_new_end,
                child_index,
                child_start,
                child_end,
                is_proactive,
                total_segments,
            },
            // `#[non_exhaustive]`：未来新增变体默认丢弃并记录日志。
            other => {
                log_info!("[ws-hub] unhandled engine event: {:?}", other);
                return;
            }
        };
        self.0.broadcast(&msg);
    }
}

/// HLS/BT 选择的 WS 实现：广播选择请求，等待任一客户端经
/// `provide_*` 投递答案；超时按引擎语义兜底（HLS 选最高带宽，BT 全下）。
pub struct WsHostSelection(pub std::sync::Arc<WsHub>);

#[async_trait::async_trait]
impl HostSelection for WsHostSelection {
    async fn select_hls_quality(
        &self,
        task_id: &str,
        options: &[HlsQualityOption],
        timeout: Duration,
    ) -> SelectionOutcome<i32> {
        let best_default = options
            .iter()
            .enumerate()
            .max_by_key(|(_, o)| o.bandwidth)
            .map(|(i, _)| i as i32)
            .unwrap_or(0);

        let (tx, rx) = oneshot::channel();
        lock_or_recover(&self.0.pending_hls).insert(task_id.to_string(), tx);

        self.0.broadcast(&WsServerMsg::HlsSelectionRequest {
            task_id: task_id.to_string(),
            options: options.iter().cloned().map(Into::into).collect(),
        });

        let outcome = match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(idx)) => SelectionOutcome::UserChose(idx),
            Ok(Err(_)) | Err(_) => {
                log_info!(
                    "[ws-selection] task {} HLS selection timed out/closed, defaulting",
                    task_id
                );
                SelectionOutcome::TimedOutDefaulted(best_default)
            }
        };
        // 必须移除等待表条目：防 map 无界增长 / 向已丢弃 Receiver 投递。
        lock_or_recover(&self.0.pending_hls).remove(task_id);
        outcome
    }

    async fn select_bt_files(
        &self,
        task_id: &str,
        files: &[BtFileEntry],
        timeout: Option<Duration>,
    ) -> SelectionOutcome<Vec<i32>> {
        let (tx, rx) = oneshot::channel();
        lock_or_recover(&self.0.pending_bt).insert(task_id.to_string(), tx);

        self.0.broadcast(&WsServerMsg::BtSelectionRequest {
            task_id: task_id.to_string(),
            files: files.iter().cloned().map(Into::into).collect(),
        });

        let effective_timeout = timeout.unwrap_or(BT_SELECTION_TIMEOUT);
        let outcome = match tokio::time::timeout(effective_timeout, rx).await {
            Ok(Ok(indices)) => SelectionOutcome::UserChose(indices),
            Ok(Err(_)) | Err(_) => {
                log_info!(
                    "[ws-selection] task {} BT selection timed out/closed, defaulting to all files",
                    task_id
                );
                // 空 = 下载全部文件（与桌面语义一致）。
                SelectionOutcome::TimedOutDefaulted(Vec::new())
            }
        };
        lock_or_recover(&self.0.pending_bt).remove(task_id);
        outcome
    }

    fn provide_hls_selection(&self, task_id: &str, selected_index: i32) {
        if let Some(tx) = lock_or_recover(&self.0.pending_hls).remove(task_id) {
            let _ = tx.send(selected_index);
        } else {
            log_info!(
                "[ws-selection] no pending HLS selection for task {}",
                task_id
            );
        }
    }

    fn provide_bt_selection(&self, task_id: &str, selected_indices: Vec<i32>) {
        if let Some(tx) = lock_or_recover(&self.0.pending_bt).remove(task_id) {
            let _ = tx.send(selected_indices);
        } else {
            log_info!(
                "[ws-selection] no pending BT selection for task {}",
                task_id
            );
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use std::sync::Arc;

    use super::*;

    #[tokio::test]
    async fn engine_event_sink_maps_task_progress_to_camel_case_json() {
        let hub = Arc::new(WsHub::new(16));
        let mut rx = hub.events.subscribe();
        let sink = EngineEventSink(Arc::clone(&hub));

        sink.emit(EngineEvent::TaskProgress {
            task_id: "t1".into(),
            status: 1,
            downloaded_bytes: 50,
            total_bytes: 200,
            speed: 1024,
            file_name: "a.bin".into(),
            save_dir: "/tmp".into(),
            url: "http://x".into(),
            error_message: String::new(),
        });

        let json = rx.recv().await.expect("broadcast recv");
        let v: serde_json::Value = serde_json::from_str(&json).expect("valid json");
        assert_eq!(v["type"], "taskProgress");
        assert_eq!(v["taskId"], "t1");
        assert_eq!(v["downloadedBytes"], 50);
        assert_eq!(v["totalBytes"], 200);
        assert_eq!(v["speed"], 1024);
        assert_eq!(v["fileName"], "a.bin");
    }

    #[tokio::test]
    async fn engine_event_sink_maps_segment_split_to_camel_case_json() {
        let hub = Arc::new(WsHub::new(16));
        let mut rx = hub.events.subscribe();
        let sink = EngineEventSink(Arc::clone(&hub));

        sink.emit(EngineEvent::SegmentSplit {
            task_id: "t1".into(),
            parent_index: 0,
            parent_new_end: 400,
            child_index: 1,
            child_start: 400,
            child_end: 800,
            is_proactive: false,
            total_segments: 2,
        });

        let json = rx.recv().await.expect("broadcast recv");
        let v: serde_json::Value = serde_json::from_str(&json).expect("valid json");
        assert_eq!(v["type"], "segmentSplit");
        assert_eq!(v["parentIndex"], 0);
        assert_eq!(v["parentNewEnd"], 400);
        assert_eq!(v["childIndex"], 1);
        assert_eq!(v["childStart"], 400);
        assert_eq!(v["childEnd"], 800);
        assert_eq!(v["isProactive"], false);
        assert_eq!(v["totalSegments"], 2);
    }

    #[tokio::test]
    async fn engine_event_sink_maps_queues_changed_to_camel_case_json() {
        use fluxdown_engine::model::QueueInfo;

        let hub = Arc::new(WsHub::new(16));
        let mut rx = hub.events.subscribe();
        let sink = EngineEventSink(Arc::clone(&hub));

        sink.emit(EngineEvent::QueuesChanged(vec![QueueInfo {
            queue_id: "q1".into(),
            name: "work".into(),
            speed_limit_kbps: 256,
            max_concurrent: 2,
            default_save_dir: "/downloads/work".into(),
            position: 0,
            default_segments: 4,
            default_user_agent: String::new(),
        }]));

        let json = rx.recv().await.expect("broadcast recv");
        let v: serde_json::Value = serde_json::from_str(&json).expect("valid json");
        assert_eq!(v["type"], "queuesChanged");
        assert_eq!(v["queues"][0]["queueId"], "q1");
        assert_eq!(v["queues"][0]["speedLimitKbps"], 256);
        assert_eq!(v["queues"][0]["maxConcurrent"], 2);
    }

    #[tokio::test]
    async fn ws_host_selection_bt_files_answered_before_timeout_returns_user_chose() {
        let hub = Arc::new(WsHub::new(16));
        let selector = Arc::new(WsHostSelection(Arc::clone(&hub)));
        let responder = Arc::clone(&selector);

        let respond_task = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(20)).await;
            responder.provide_bt_selection("task-a", vec![1, 2]);
        });

        let outcome = selector
            .select_bt_files("task-a", &[], Some(Duration::from_millis(500)))
            .await;

        respond_task.await.expect("responder task panicked");
        assert_eq!(outcome, SelectionOutcome::UserChose(vec![1, 2]));
    }

    #[tokio::test]
    async fn ws_host_selection_bt_files_times_out_with_no_answer_defaults_to_empty_vec() {
        let hub = Arc::new(WsHub::new(16));
        let selector = WsHostSelection(hub);

        let outcome = selector
            .select_bt_files("task-b", &[], Some(Duration::from_millis(50)))
            .await;

        assert_eq!(outcome, SelectionOutcome::TimedOutDefaulted(Vec::new()));
    }

    #[tokio::test]
    async fn ws_host_selection_hls_quality_times_out_defaults_to_highest_bandwidth_slot() {
        let hub = Arc::new(WsHub::new(16));
        let selector = WsHostSelection(hub);
        // Deliberately give the option at slice position 1 the highest
        // bandwidth while giving it an unrelated `index` field (9), to pin
        // down that the timeout default picks the *slice position* of the
        // best-bandwidth option, not its `index` field -- this mirrors
        // `RinfHostSelection::select_hls_quality`'s identical
        // `enumerate().max_by_key(...).map(|(i, _)| i as i32)` logic.
        let options = [
            HlsQualityOption {
                index: 7,
                bandwidth: 500_000,
                width: 640,
                height: 360,
            },
            HlsQualityOption {
                index: 9,
                bandwidth: 5_000_000,
                width: 1920,
                height: 1080,
            },
            HlsQualityOption {
                index: 3,
                bandwidth: 2_000_000,
                width: 1280,
                height: 720,
            },
        ];

        let outcome = selector
            .select_hls_quality("task-c", &options, Duration::from_millis(50))
            .await;

        assert_eq!(outcome, SelectionOutcome::TimedOutDefaulted(1));
    }
}
