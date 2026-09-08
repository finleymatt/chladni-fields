import Foundation
import Capacitor
import StoreKit
import UIKit

/// Chladni Plus and the tip jar, on StoreKit 2. Nothing leaves the device: Apple verifies the
/// transactions, the App Store remembers them per Apple ID, and `entitlements` reads them back.
@objc(PurchasesPlugin)
public class PurchasesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PurchasesPlugin"
    public let jsName = "Purchases"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "entitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageSubscriptions", returnType: CAPPluginReturnPromise)
    ]

    /// Product identifiers, as created in App Store Connect. Anything in `plusIds` unlocks Plus.
    static let plusIds: Set<String> = ["lol.iamra.chladni.plus.monthly", "lol.iamra.chladni.plus.yearly", "lol.iamra.chladni.plus.lifetime"]
    static let tipIds: Set<String> = ["lol.iamra.chladni.tip.small", "lol.iamra.chladni.tip.medium", "lol.iamra.chladni.tip.large"]

    private var updates: Task<Void, Never>?

    public override func load() {
        // finish transactions that arrive outside a purchase call (renewals, family sharing, Ask to Buy)
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                if case .verified(let t) = result {
                    await t.finish()
                    await self?.pushEntitlements()
                }
            }
        }
    }

    deinit { updates?.cancel() }

    @objc func getProducts(_ call: CAPPluginCall) {
        let ids = (call.getArray("ids", String.self) ?? []).isEmpty ? Array(Self.plusIds.union(Self.tipIds)) : call.getArray("ids", String.self)!
        Task {
            do {
                let products = try await Product.products(for: ids)
                let list: [[String: Any]] = products.map { p in
                    var kind = "consumable"
                    if p.type == .autoRenewable { kind = "subscription" } else if p.type == .nonConsumable { kind = "lifetime" }
                    var period = ""
                    if let sub = p.subscription {
                        switch sub.subscriptionPeriod.unit { case .month: period = "month"; case .year: period = "year"; case .week: period = "week"; case .day: period = "day"; @unknown default: period = "" }
                    }
                    var trial = ""
                    if let intro = p.subscription?.introductoryOffer, intro.paymentMode == .freeTrial {
                        var unit = "day"
                        switch intro.period.unit { case .day: unit = "day"; case .week: unit = "week"; case .month: unit = "month"; case .year: unit = "year"; @unknown default: unit = "day" }
                        trial = "\(intro.period.value) \(unit)"
                    }
                    return ["id": p.id, "title": p.displayName, "description": p.description, "price": p.displayPrice, "kind": kind, "period": period, "trial": trial]
                }
                call.resolve(["products": list])
            } catch {
                call.reject("Could not load products: \(error.localizedDescription)")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("id is required"); return }
        Task {
            do {
                guard let product = try await Product.products(for: [id]).first else { call.reject("Unknown product \(id)"); return }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else { call.reject("Purchase could not be verified"); return }
                    await transaction.finish()
                    let ent = await currentEntitlements()
                    call.resolve(["state": "purchased", "id": id, "entitlements": ent])
                case .userCancelled:
                    call.resolve(["state": "cancelled", "id": id])
                case .pending:
                    call.resolve(["state": "pending", "id": id])
                @unknown default:
                    call.resolve(["state": "unknown", "id": id])
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do { try await AppStore.sync() } catch { /* offline or cancelled: fall through to what the device already knows */ }
            let ent = await currentEntitlements()
            call.resolve(ent)
        }
    }

    @objc func entitlements(_ call: CAPPluginCall) {
        Task { call.resolve(await currentEntitlements()) }
    }

    @objc func manageSubscriptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene else {
                call.reject("No active window"); return
            }
            do { try await AppStore.showManageSubscriptions(in: scene); call.resolve() } catch { call.reject(error.localizedDescription) }
        }
    }

    private func currentEntitlements() async -> [String: Any] {
        var plus = false, ids: [String] = [], expires: Double = 0, lifetime = false
        for await result in Transaction.currentEntitlements {
            guard case .verified(let t) = result else { continue }
            if t.revocationDate != nil { continue }
            ids.append(t.productID)
            if Self.plusIds.contains(t.productID) {
                plus = true
                if t.productType == .nonConsumable { lifetime = true }
                if let e = t.expirationDate { expires = max(expires, e.timeIntervalSince1970 * 1000) }
            }
        }
        return ["plus": plus, "lifetime": lifetime, "productIds": ids, "expires": expires]
    }

    private func pushEntitlements() async {
        let ent = await currentEntitlements()
        notifyListeners("entitlements", data: ent)
    }
}
