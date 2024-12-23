package com.ondc.yugabyte_integration.Entity;

import java.util.List;

public class PayloadDetailsDTO {
    private SessionDetails.Type npType;
    private String domain;
    private Payload payloads;

    public PayloadDetailsDTO(SessionDetails.Type npType, String domain, Payload payloads) {
        this.npType = npType;
        this.domain = domain;
        this.payloads = payloads;
    }

    public SessionDetails.Type getNpType() {
        return npType;
    }

    public void setNpType(SessionDetails.Type npType) {
        this.npType = npType;
    }

    public String getDomain() {
        return domain;
    }

    public void setDomain(String domain) {
        this.domain = domain;
    }

    public Payload getPayloads() {
        return payloads;
    }

    public void setPayloads(Payload payloads) {
        this.payloads = payloads;
    }
}
