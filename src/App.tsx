import { Routes, Route, Navigate } from "react-router-dom";

import { AppLayout } from "./components/AppLayout";
import { GatewayListPage } from "./components/GatewayListPage";
import { GatewayDetailPage } from "./components/GatewayDetailPage";
import { GatewayInstancePage } from "./components/GatewayInstancePage";
import { GatewayInstanceDetailPage } from "./components/GatewayInstanceDetailPage";
import { PackagePage } from "./components/PackagePage";
import { ReleasePage } from "./components/ReleasePage";
import { UpgradePlanApprovePage } from "./components/UpgradePlanApprovePage";

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<GatewayListPage />} />
        <Route path="/gateways/:gatewayId" element={<GatewayDetailPage />} />
        <Route path="/instance" element={<GatewayInstancePage />} />
        <Route
          path="/instance/:gatewayId"
          element={<GatewayInstanceDetailPage />}
        />
        {/* 包管理（录入/托管包）与发布（把包装出去）分开：
            发布 ① 升级安装（stack/gops/gx）复用原「升级计划」创建面板；
            旧入口 /upgrade-plan 重定向到 /release，批准入口保持在 /upgrade-plan/approve。 */}
        <Route path="/packages" element={<PackagePage />} />
        <Route path="/release" element={<ReleasePage />} />
        <Route
          path="/upgrade-plan"
          element={<Navigate to="/release" replace />}
        />
        <Route
          path="/upgrade-plan/approve"
          element={<UpgradePlanApprovePage />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
