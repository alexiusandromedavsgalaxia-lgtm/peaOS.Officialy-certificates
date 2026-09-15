#include "certificate_monitor.hpp"

namespace certificate_monitor {
namespace {
CertificateRecord g_records[kMaxTrackedCertificates]{};
Inventory g_inventory{};
uint64_t g_last_check = 0;

int find(uint64_t serial) { for (uint32_t i = 0; i < kMaxTrackedCertificates; ++i) if (g_records[i].certificate.serial == serial) return static_cast<int>(i); return -1; }
int free_slot() { for (uint32_t i = 0; i < kMaxTrackedCertificates; ++i) if (!g_records[i].certificate.serial) return static_cast<int>(i); return -1; }
void recompute() {
    g_inventory = {};
    for (uint32_t i = 0; i < kMaxTrackedCertificates; ++i) {
        const auto& r = g_records[i];
        if (!r.certificate.serial) continue;
        ++g_inventory.total;
        if (r.installed) ++g_inventory.installed;
        if (r.certificate.distribution == static_cast<uint8_t>(certificate::Distribution::Local)) ++g_inventory.local_distribution;
        if (r.certificate.distribution == static_cast<uint8_t>(certificate::Distribution::WebDistribution)) ++g_inventory.web_distribution;
        switch (r.state) {
            case InstallState::Active: ++g_inventory.active; break;
            case InstallState::Revoked: ++g_inventory.revoked; break;
            case InstallState::Expired: ++g_inventory.expired; break;
            case InstallState::Invalid: ++g_inventory.invalid; break;
            case InstallState::ServerUnavailable: ++g_inventory.server_unavailable; break;
            default: break;
        }
    }
}
}

void init(uint64_t now) { for (auto& r : g_records) r = {}; g_inventory = {}; g_last_check = now; }

bool register_certificate(const certificate::Certificate* cert, bool installed, uint64_t now) {
    if (!cert || cert->magic != certificate::kMagic || cert->version != certificate::kVersion || !cert->serial) return false;
    int i = find(cert->serial); if (i < 0) i = free_slot(); if (i < 0) return false;
    auto& r = g_records[i];
    r.certificate = *cert;
    r.installed = installed;
    r.server_active = false;
    r.server_revoked = false;
    r.state = certificate::expired(cert, now) ? InstallState::Expired : (installed ? InstallState::Installed : InstallState::Missing);
    r.last_checked = now;
    recompute();
    return true;
}

bool remove_certificate(uint64_t serial) { int i = find(serial); if (i < 0) return false; g_records[i] = {}; recompute(); return true; }

uint32_t check_all(const certificate::ServerValidation& server, const uint8_t* expected_origin_hash, const uint8_t* package_hash, uint64_t now) {
    uint32_t checked = 0;
    for (uint32_t i = 0; i < kMaxTrackedCertificates; ++i) {
        auto& r = g_records[i];
        if (!r.certificate.serial) continue;

        // Validate the actual registered certificate. Do not reconstruct a partial
        // certificate here: doing so loses expiry, origin, issuer and signature data.
        const auto status = certificate::validate_server(&r.certificate, server, expected_origin_hash, package_hash);
        r.server_active = server.active;
        r.server_revoked = server.revoked;
        r.last_checked = now;

        if (certificate::expired(&r.certificate, now)) {
            r.state = InstallState::Expired;
        } else if (status == certificate::Status::NotActiveOnServer || status == certificate::Status::Revoked) {
            r.state = InstallState::Revoked;
        } else if (status == certificate::Status::ServerUnavailable) {
            r.state = InstallState::ServerUnavailable;
        } else if (status != certificate::Status::Valid) {
            r.state = InstallState::Invalid;
        } else {
            r.state = InstallState::Active;
        }
        ++checked;
    }
    g_last_check = now;
    recompute();
    return checked;
}

bool tick(uint64_t now, const certificate::ServerValidation& server, const uint8_t* expected_origin_hash, const uint8_t* package_hash) {
    if (now < g_last_check || now - g_last_check < kCheckIntervalSeconds) return false;
    check_all(server, expected_origin_hash, package_hash, now);
    return true;
}

const Inventory& inventory() { return g_inventory; }
const CertificateRecord* records(uint32_t* count) { if (count) *count = kMaxTrackedCertificates; return g_records; }
}
