import { Routes, Route, Navigate } from "react-router-dom";

import { AppLayout } from "./components/AppLayout";
import { GatewayListPage } from "./components/GatewayListPage";
import { GatewayDetailPage } from "./components/GatewayDetailPage";
import { GatewayInstancePage } from "./components/GatewayInstancePage";
import { GatewayInstanceDetailPage } from "./components/GatewayInstanceDetailPage";
import { PackageListPage } from "./components/PackageListPage";
import { PackageAddPage } from "./components/PackageAddPage";
import { ReleasePage } from "./components/ReleasePage";
import { UpgradePlanApprovePage } from "./components/UpgradePlanApprovePage";

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<GatewayListPage />} />
        {/* 网关详情分四个 tab（状态 / 绑定客户 / 运行时控制 / 升级）：
            每个分区都是独立路由，刷新、分享链接、浏览器后退都能回到同一张页。 */}
        <Route path="/gateways/:gatewayId" element={<GatewayDetailPage />} />
        <Route
          path="/gateways/:gatewayId/:tab"
          element={<GatewayDetailPage />}
        />
        <Route path="/instance" element={<GatewayInstancePage />} />
        <Route
          path="/instance/:gatewayId"
          element={<GatewayInstanceDetailPage />}
        />
        {/* 安装包管理（已托管包列表 / 状态）与安装包录入分开：
            /packages 看已托管包，/packages/add 录入来源（镜像制品）。
            发布另见 /release（把包装出去）。 */}
        <Route path="/packages" element={<PackageListPage />} />
        <Route path="/packages/add" element={<PackageAddPage />} />
        <Route path="/release" element={<ReleasePage />} />
        <Route path="/release/execute" element={<UpgradePlanApprovePage />} />
        {/* 旧地址兼容：`/upgrade-plan` 系列统一重定向到新的发布路由。 */}
        <Route
          path="/upgrade-plan"
          element={<Navigate to="/release" replace />}
        />
        <Route
          path="/upgrade-plan/approve"
          element={<Navigate to="/release/execute" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
