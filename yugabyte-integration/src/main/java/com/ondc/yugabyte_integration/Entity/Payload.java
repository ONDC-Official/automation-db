package com.ondc.yugabyte_integration.Entity;

import com.ondc.yugabyte_integration.Service.MapToJsonConverter;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;

import java.util.Map;

@Entity
@Table(name = "payload")
@NoArgsConstructor
@AllArgsConstructor
public class Payload {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private Long id;
    private String messageId;
    private String transactionalId;
    @Enumerated(EnumType.STRING)
    private Action action;
    private String bppId;
    private String bapId;

    @Convert(converter = MapToJsonConverter.class)
    private Map<String, Object> payload;

    public enum Action {
        SEARCH ("search"),
        ON_SEARCH("on_search"),
        SELECT("select"),
        ON_SELECT("on_select"),
        INIT("init"),
        ON_INIT("on_init"),
        CONFIRM("confirm"),
        ON_CONFIRM("on_confirm"),
        STATUS("status"),
        ON_STATUS("on_status"),
        CANCEL("cancel"),
        ON_CANCEL("on_cancel");

        public final String action;

        private Action(String action) {
            this.action = action;
        }
    }

    @Column(name = "id")
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    @Column(name = "message_id")
    public String getMessageId() {
        return messageId;
    }

    public void setMessageId(String messageId) {
        this.messageId = messageId;
    }

    @Column(name = "transactional_id")
    public String getTransactionalId() {
        return transactionalId;
    }

    public void setTransactionalId(String transactionalId) {
        this.transactionalId = transactionalId;
    }

    @Column(name = "action")
    public Action getAction() {
        return action;
    }

    public void setAction(Action action) {
        this.action = action;
    }

    @Column(name = "payload")
    public Map<String, Object> getPayload() {
        return payload;
    }

    public void setPayload(Map<String, Object> payload) {
        this.payload = payload;
    }

    @Column(name = "bpp_id")
    public String getBppId() {
        return bppId;
    }

    public void setBppId(String bppId) {
        this.bppId = bppId;
    }

    @Column(name = "bap_id")
    public String getBapId() {
        return bapId;
    }

    public void setBapId(String bapId) {
        this.bapId = bapId;
    }

    @Override
    public String toString() {
        return "Payload{" +
                "id=" + id +
                ", messageId='" + messageId + '\'' +
                ", transactionalId='" + transactionalId + '\'' +
                ", action=" + action +
                ", bppId='" + bppId + '\'' +
                ", bapId='" + bapId + '\'' +
                ", payload=" + payload +
                '}';
    }
}
