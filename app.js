// app.js

document.addEventListener('DOMContentLoaded', () => {
    // --- НАСТРОЙКИ ---
    const gristBaseUrl = 'http://18.153.125.52:8484'; 
    const docId = 'oHEUL5eSRBwJ'; 
    
    // ВНИМАНИЕ: ХРАНЕНИЕ API-КЛЮЧА В КЛИЕНТСКОМ JAVASCRIPT НЕБЕЗОПАСНО ДЛЯ ПРОДАКТИВА!
    const apiKey = 'd5f1402069843ddf8f04e54ce7efb93818ff2f80'; 

    // ID таблиц в Grist
    const hikesTableApiId = 'Table2';       
    const participantsTableApiId = 'Table7'; 
    const registrationsTableApiId = 'Table10';

    // Имена колонок (Column ID) в ваших таблицах Grist
    // Таблица Походов (Table2)
    const hikeNameCol = 'F'; 
    const hikeDateCol = 'A';     
    const hikeStatusCol = 'D'; 
    const hikeStatusOpenValue = "1. Планирование"; // Точное значение статуса

    // Таблица Участников (Table7)
    const participantEmailCol = 'Email';
    const participantFirstNameCol = 'Name';
    // Фамилия не нужна
    const participantPhoneCol = 'Telephone';
    const participantTelegramCol = 'Telegram'; // Новая колонка
    const participantWhatsappCol = 'Whatsapp'; // Новая колонка (Boolean)
    const participantCityCol = 'Town';

    // Таблица Регистраций (Table10)
    const registrationHikeRefCol = 'A';     
    const registrationParticipantRefCol = 'B'; 
    // --- КОНЕЦ НАСТРОЕK ---

    const hikeSelect = document.getElementById('hike');
    const registrationForm = document.getElementById('registration-form');
    const messageArea = document.getElementById('message-area');
    const loadingHikesDiv = document.getElementById('loading-hikes');
    const submitButton = document.getElementById('submit-button');

    async function gristRequest(endpoint, method = 'GET', body = null) {
        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        const options = { method, headers };
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        const fullUrl = `${gristBaseUrl}/api/docs/${docId}/${endpoint}`;
        console.log(`Отправка запроса: ${method} ${fullUrl}`, body ? `с телом: ${JSON.stringify(body)}` : '');

        try {
            const response = await fetch(fullUrl, options);
            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    errorData = { error: await response.text() };
                }
                console.error('Ошибка Grist API:', response.status, errorData);
                throw new Error(`Ошибка Grist API: ${response.status} - ${errorData.error || JSON.stringify(errorData)}`);
            }
            if (response.status === 204) { 
                return { success: true };
            }
            return await response.json();
        } catch (error) {
            console.error('Сетевая ошибка или ошибка парсинга JSON:', error);
            messageArea.textContent = `Критическая ошибка: ${error.message}. Проверьте консоль.`;
            messageArea.className = 'message error';
            throw error;
        }
    }

    async function loadHikes() {
        try {
            const filter = {};
            filter[hikeStatusCol] = [hikeStatusOpenValue]; 
            const encodedFilter = encodeURIComponent(JSON.stringify(filter));
            
            const data = await gristRequest(`tables/${hikesTableApiId}/records?filter=${encodedFilter}`);
            
            loadingHikesDiv.style.display = 'none';
            registrationForm.style.display = 'block';

            if (data && data.records && data.records.length > 0) {
                hikeSelect.innerHTML = '<option value="">-- Выберите поход --</option>';
                data.records.forEach(record => {
                    const option = document.createElement('option');
                    option.value = record.id; 
                    option.textContent = `${record.fields[hikeNameCol] || 'Поход без названия'} (${record.fields[hikeDateCol] || 'Дата не указана'})`;
                    hikeSelect.appendChild(option);
                });
            } else {
                hikeSelect.innerHTML = '<option value="">Нет доступных походов для регистрации</option>';
                submitButton.disabled = true;
            }
        } catch (error) {
            loadingHikesDiv.textContent = 'Не удалось загрузить список походов. Попробуйте обновить страницу.';
            loadingHikesDiv.className = 'message error';
            console.error('Failed to load hikes:', error);
        }
    }

    registrationForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        messageArea.textContent = 'Обработка регистрации...';
        messageArea.className = 'message info';
        submitButton.disabled = true;

        const formData = new FormData(registrationForm);
        const email = formData.get('email').trim();
        const firstName = formData.get('firstName').trim();
        const phone = formData.get('phone').trim();
        const telegram = formData.get('telegram').trim(); // Новое поле
        const city = formData.get('city').trim();
        const whatsapp = formData.get('whatsapp') === 'true'; // Чекбокс вернет 'true' или null
        const selectedHikeRowId = parseInt(hikeSelect.value, 10);

        if (!selectedHikeRowId) {
            messageArea.textContent = 'Пожалуйста, выберите поход.';
            messageArea.className = 'message error';
            submitButton.disabled = false;
            return;
        }

        try {
            let participantRowId;
            const participantFilter = {};
            participantFilter[participantEmailCol] = [email];
            const encodedParticipantFilter = encodeURIComponent(JSON.stringify(participantFilter));
            
            const existingParticipants = await gristRequest(`tables/${participantsTableApiId}/records?filter=${encodedParticipantFilter}`);

            const participantFields = {
                [participantFirstNameCol]: firstName,
                [participantPhoneCol]: phone,
                [participantTelegramCol]: telegram,
                [participantWhatsappCol]: whatsapp,
                [participantCityCol]: city
            };

            if (existingParticipants && existingParticipants.records && existingParticipants.records.length > 0) {
                participantRowId = existingParticipants.records[0].id;
                console.log(`Найден существующий участник с ID: ${participantRowId}`);
                await gristRequest(`tables/${participantsTableApiId}/records`, 'PATCH', {
                    records: [{ id: participantRowId, fields: participantFields }]
                });
                messageArea.textContent = 'Данные участника обновлены. ';
            } else {
                console.log(`Участник с email ${email} не найден, создаем нового.`);
                const newParticipantPayloadFields = { ...participantFields }; // Копируем поля
                newParticipantPayloadFields[participantEmailCol] = email; // Добавляем Email для нового участника

                const newParticipantData = await gristRequest(`tables/${participantsTableApiId}/records`, 'POST', {
                    records: [{ fields: newParticipantPayloadFields }]
                });
                
                if (newParticipantData && newParticipantData.records && newParticipantData.records.length > 0 && newParticipantData.records[0].id) {
                    participantRowId = newParticipantData.records[0].id;
                } else if (Array.isArray(newParticipantData) && newParticipantData.length > 0 && typeof newParticipantData[0] === 'number') { 
                    participantRowId = newParticipantData[0];
                } else {
                    console.error("Не удалось получить ID нового участника:", newParticipantData);
                    throw new Error('Не удалось создать профиль участника. Ответ API: ' + JSON.stringify(newParticipantData));
                }
                console.log(`Создан новый участник с ID: ${participantRowId}`);
                messageArea.textContent = 'Профиль участника создан. ';
            }

            const registrationFilter = {};
            registrationFilter[registrationHikeRefCol] = [selectedHikeRowId];
            registrationFilter[registrationParticipantRefCol] = [participantRowId]; 
            const encodedRegFilter = encodeURIComponent(JSON.stringify(registrationFilter));

            const existingRegistrations = await gristRequest(`tables/${registrationsTableApiId}/records?filter=${encodedRegFilter}`);

            if (existingRegistrations && existingRegistrations.records && existingRegistrations.records.length > 0) {
                messageArea.textContent += 'Вы уже зарегистрированы на этот поход!';
                messageArea.className = 'message warning';
            } else {
                const registrationPayload = {
                    records: [{
                        fields: {
                            [registrationHikeRefCol]: selectedHikeRowId, 
                            [registrationParticipantRefCol]: participantRowId
                        }
                    }]
                };
                await gristRequest(`tables/${registrationsTableApiId}/records`, 'POST', registrationPayload);
                messageArea.textContent += 'Вы успешно зарегистрированы на поход!';
                messageArea.className = 'message success';
                registrationForm.reset();
            }

        } catch (error) {
            messageArea.textContent = `Ошибка регистрации: ${error.message}`;
            messageArea.className = 'message error';
            console.error('Registration process failed:', error);
        } finally {
            submitButton.disabled = false;
        }
    });

    loadHikes();
});
