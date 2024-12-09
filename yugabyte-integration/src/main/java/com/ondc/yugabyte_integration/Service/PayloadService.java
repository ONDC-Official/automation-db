package com.ondc.yugabyte_integration.Service;

import com.ondc.yugabyte_integration.Entity.Payload;
import com.ondc.yugabyte_integration.Repository.PayloadRepository;
import jakarta.transaction.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class PayloadService {

    private final Logger Log = LoggerFactory.getLogger(PayloadService.class);

    @Autowired
    private PayloadRepository repository;

    public List<Payload> getAllPayloads() {
        return repository.findAll();
    }

    public Payload getPayloadById(Long id) {
        return repository.findById(id).orElse(null);
    }

    public Optional<Payload> getPayloadByTransactionId(String transactionId) {
        return repository.findByTransactionId(transactionId);
    }

    @Transactional
    public Payload savePayload(Payload payload) {
        return repository.save(payload);
    }

    public Payload updatePayload(Long id, Payload updatedPayload) {
        return repository.findById(id)
                .map(existingPayload -> {
                    existingPayload.setMessageId(updatedPayload.getMessageId());
                    existingPayload.setTransactionId(updatedPayload.getTransactionId());
                    existingPayload.setAction(updatedPayload.getAction());
                    existingPayload.setBppId(updatedPayload.getBppId());
                    existingPayload.setBapId(updatedPayload.getBapId());
                    existingPayload.setJsonObject(updatedPayload.getJsonObject());
                    existingPayload.setType(updatedPayload.getType());
                    existingPayload.setHttpStatus(updatedPayload.getHttpStatus());
                    return repository.save(existingPayload);
                })
                .orElseThrow(() -> new RuntimeException("Payload not found with id: " + id));
    }

    public void deletePayload(Long id) {
        repository.deleteById(id);
    }
}
