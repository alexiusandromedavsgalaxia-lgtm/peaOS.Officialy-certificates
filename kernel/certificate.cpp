#include "certificate.hpp"

namespace certificate {
namespace {
Certificate g_current{};
bool g_active = false;
bool all_zero(const uint8_t* data, uint32_t size) { if (!data) return true; for (uint32_t i=0;i<size;++i) if(data[i]!=0)return false; return true; }
bool valid_distribution(uint8_t value) { return value==static_cast<uint8_t>(Distribution::Local)||value==static_cast<uint8_t>(Distribution::WebDistribution); }
bool equal_bytes(const uint8_t* a,const uint8_t* b,uint32_t n){if(!a||!b)return false;for(uint32_t i=0;i<n;++i)if(a[i]!=b[i])return false;return true;}
}
void init(){g_current={};g_active=false;}
bool expired(const Certificate* cert,uint64_t now){if(!cert||cert->magic!=kMagic||cert->version!=kVersion||now==0)return true;return cert->expires_at<=cert->issued_at||now<cert->issued_at||now>=cert->expires_at;}
bool can_add_application(const Certificate* cert,uint8_t current_count){if(!cert||cert->magic!=kMagic||cert->version!=kVersion)return false;if(cert->application_count==0||cert->application_count>kMaxApplications)return false;return current_count<kMaxApplications&&current_count<cert->application_count;}
Status validate(const Certificate* cert,uint64_t now,uint8_t app_count,Distribution distribution){
    if(!cert||cert->magic!=kMagic||cert->version!=kVersion||cert->serial==0)return Status::Invalid;
    if(all_zero(cert->certificate_id,sizeof(cert->certificate_id))||all_zero(cert->issuer_key_id,sizeof(cert->issuer_key_id))||all_zero(cert->origin_hash,sizeof(cert->origin_hash))||all_zero(cert->signature,sizeof(cert->signature)))return Status::Invalid;
    if(cert->application_count==0||cert->application_count>kMaxApplications||app_count==0||app_count>cert->application_count)return Status::ApplicationLimit;
    if(expired(cert,now)||cert->expires_at-cert->issued_at>kValiditySeconds)return Status::Expired;
    if(!valid_distribution(cert->distribution)||distribution!=static_cast<Distribution>(cert->distribution))return Status::WebDistributionRequired;
    return Status::Valid;
}
Status validate_server(const Certificate* cert,const ServerValidation& server,const uint8_t* expected_origin_hash,const uint8_t* package_hash){
    if(!cert||cert->magic!=kMagic||cert->version!=kVersion)return Status::Invalid;
    if(!server.reachable)return Status::ServerUnavailable;
    if(server.revoked||!server.active)return Status::NotActiveOnServer;
    if(!server.signature_valid)return Status::SignatureInvalid;
    if(!server.issuer_valid)return Status::IssuerMismatch;
    if(!server.origin_valid||!equal_bytes(cert->origin_hash,expected_origin_hash,kSha256Size))return Status::OriginMismatch;
    if(!server.package_valid||!package_hash)return Status::PackageMismatch;
    return Status::Valid;
}
bool install(const Certificate* cert){if(!cert||cert->magic!=kMagic||cert->version!=kVersion)return false;g_current=*cert;g_active=true;return true;}
bool active(){return g_active;}
void invalidate(){g_current={};g_active=false;}
const Certificate* current(){return g_active?&g_current:nullptr;}
}
