-- Taruh sebagai Script di ServerScriptService.
-- Jangan taruh API_SECRET di LocalScript atau ReplicatedStorage.

local HttpService = game:GetService("HttpService")
local DataStoreService = game:GetService("DataStoreService")
local MarketplaceService = game:GetService("MarketplaceService")
local RunService = game:GetService("RunService")

if RunService:IsStudio() then
    print("[Nekobuxx] Mode Studio aman. Reporter produksi, DataStore, dan Railway dinonaktifkan.")
    return
end

local API_URL = "https://GANTI-DOMAIN-BOT-KAMU.up.railway.app/api/purchases"
local API_SECRET = "GANTI_DENGAN_API_SECRET_YANG_SAMA_DENGAN_BOT"
local MIN_ITEM_PRICE = 30
local MAX_RETRIES = 3
local DUPLICATE_WINDOW_SECONDS = 30
local DELIVERY_RETRY_INTERVAL_SECONDS = 30
local DELIVERY_LEASE_SECONDS = 120
local DELIVERY_BATCH_SIZE = 5
local MAX_QUEUED_PURCHASES = 1500

local deliveryStore = DataStoreService:GetDataStore("NekobuxxPurchaseDeliveryV1")
local DELIVERY_QUEUE_KEY = "pending-purchases-v1"
local SERVER_ID = game.JobId ~= "" and game.JobId or HttpService:GenerateGUID(false)

local recentPurchases = {}
local deliveryWorkerRunning = false

local function configurationReady()
	if API_URL:find("GANTI%-DOMAIN%-BOT%-KAMU") then
		warn("[Nekobuxx] API_URL belum diisi.")
		return false
	end
	if API_SECRET == "" or API_SECRET:find("GANTI_DENGAN", 1, true) then
		warn("[Nekobuxx] API_SECRET belum diisi.")
		return false
	end
	return true
end

local function isDuplicate(player, itemId, itemType)
	local key = string.format("%d:%s:%d", player.UserId, itemType, itemId)
	local now = os.clock()
	local previous = recentPurchases[key]
	if previous and now - previous < DUPLICATE_WINDOW_SECONDS then
		return true
	end

	recentPurchases[key] = now
	task.delay(DUPLICATE_WINDOW_SECONDS, function()
		if recentPurchases[key] == now then
			recentPurchases[key] = nil
		end
	end)
	return false
end

local function getProductInfo(itemId, itemType)
	local infoType = if itemType == "bundle" then Enum.InfoType.Bundle else Enum.InfoType.Asset
	local success, result = pcall(function()
		return MarketplaceService:GetProductInfoAsync(itemId, infoType)
	end)
	if not success then
		warn("[Nekobuxx] Gagal mengambil detail item:", result)
		return nil
	end
	return result
end

local function sendToBot(payload)
	local body = HttpService:JSONEncode(payload)
	local lastError = "unknown error"

	for attempt = 1, MAX_RETRIES do
		local requestSuccess, response = pcall(function()
			return HttpService:RequestAsync({
				Url = API_URL,
				Method = "POST",
				Headers = {
					["Content-Type"] = "application/json",
					["Authorization"] = "Bearer " .. API_SECRET,
				},
				Body = body,
			})
		end)

		if requestSuccess and response.Success then
			print("[Nekobuxx] Pembelian terkirim ke bot:", payload.eventId)
			return true, nil
		end

		lastError = requestSuccess
			and string.format("HTTP %s: %s", tostring(response.StatusCode), tostring(response.Body))
			or tostring(response)

		if attempt < MAX_RETRIES then
			task.wait(2 ^ (attempt - 1))
		end
	end

	warn("[Nekobuxx] Gagal mengirim pembelian:", lastError)
	return false, lastError
end

local function normalizeDeliveryState(value)
	local state = if type(value) == "table" then value else {}
	if type(state.items) ~= "table" then
		state.items = {}
	end
	if type(state.leaseOwner) ~= "string" then
		state.leaseOwner = ""
	end
	if type(state.leaseUntil) ~= "number" then
		state.leaseUntil = 0
	end
	return state
end

local function stateContainsEvent(state, eventId)
	for _, entry in ipairs(state.items) do
		if type(entry) == "table" and entry.eventId == eventId then
			return true
		end
	end
	return false
end

local function enqueuePurchase(payload)
	local success, updatedState = pcall(function()
		return deliveryStore:UpdateAsync(DELIVERY_QUEUE_KEY, function(current)
			local state = normalizeDeliveryState(current)
			if stateContainsEvent(state, payload.eventId) then
				return state
			end
			if #state.items >= MAX_QUEUED_PURCHASES then
				return state
			end
			table.insert(state.items, {
				eventId = payload.eventId,
				payload = payload,
				queuedAt = os.time(),
				attempts = 0,
				nextAttemptAt = 0,
				lastError = "",
			})
			return state
		end)
	end)

	if not success then
		warn("[Nekobuxx] Gagal menyimpan pembelian ke antrean persisten:", updatedState)
		return false
	end

	local state = normalizeDeliveryState(updatedState)
	if not stateContainsEvent(state, payload.eventId) then
		warn("[Nekobuxx] Antrean pembelian penuh. Pengiriman langsung akan dicoba.")
		return false
	end
	return true
end

local function acquireDeliveryBatch()
	local now = os.time()
	local success, updatedState = pcall(function()
		return deliveryStore:UpdateAsync(DELIVERY_QUEUE_KEY, function(current)
			local state = normalizeDeliveryState(current)
			local hasDueItem = false
			for _, entry in ipairs(state.items) do
				if type(entry) == "table" and tonumber(entry.nextAttemptAt or 0) <= now then
					hasDueItem = true
					break
				end
			end

			if not hasDueItem then
				if state.leaseOwner == SERVER_ID then
					state.leaseOwner = ""
					state.leaseUntil = 0
				end
				return state
			end

			if state.leaseOwner ~= ""
				and state.leaseOwner ~= SERVER_ID
				and state.leaseUntil > now
			then
				return state
			end

			state.leaseOwner = SERVER_ID
			state.leaseUntil = now + DELIVERY_LEASE_SECONDS
			return state
		end)
	end)

	if not success then
		warn("[Nekobuxx] Gagal membaca antrean pembelian:", updatedState)
		return {}
	end

	local state = normalizeDeliveryState(updatedState)
	if state.leaseOwner ~= SERVER_ID then
		return {}
	end

	local batch = {}
	for _, entry in ipairs(state.items) do
		if type(entry) == "table"
			and type(entry.payload) == "table"
			and tonumber(entry.nextAttemptAt or 0) <= now
		then
			table.insert(batch, entry)
			if #batch >= DELIVERY_BATCH_SIZE then
				break
			end
		end
	end
	return batch
end

local function finishDeliveryBatch(succeeded, failed)
	local now = os.time()
	local success, updateError = pcall(function()
		deliveryStore:UpdateAsync(DELIVERY_QUEUE_KEY, function(current)
			local state = normalizeDeliveryState(current)
			local remaining = {}

			for _, entry in ipairs(state.items) do
				local eventId = type(entry) == "table" and entry.eventId or nil
				if eventId and succeeded[eventId] then
					-- Sudah diterima API. Hapus dari antrean persisten.
				else
					local failure = eventId and failed[eventId] or nil
					if failure then
						local attempts = tonumber(entry.attempts or 0) + 1
						local multiplier = 2 ^ math.min(math.max(attempts - 1, 0), 4)
						entry.attempts = attempts
						entry.nextAttemptAt = now
							+ math.min(300, DELIVERY_RETRY_INTERVAL_SECONDS * multiplier)
						entry.lastError = string.sub(tostring(failure), 1, 300)
					end
					table.insert(remaining, entry)
				end
			end

			state.items = remaining
			if state.leaseOwner == SERVER_ID then
				state.leaseOwner = ""
				state.leaseUntil = 0
			end
			return state
		end)
	end)

	if not success then
		warn("[Nekobuxx] Gagal memperbarui antrean pembelian:", updateError)
	end
end

local function processDeliveryQueueOnce()
	if deliveryWorkerRunning or not configurationReady() then
		return
	end
	deliveryWorkerRunning = true

	local workerSuccess, workerError = xpcall(function()
		local batch = acquireDeliveryBatch()
		if #batch == 0 then
			return
		end

		local succeeded = {}
		local failed = {}
		for _, entry in ipairs(batch) do
			local sent, sendError = sendToBot(entry.payload)
			if sent then
				succeeded[entry.eventId] = true
			else
				failed[entry.eventId] = sendError or "unknown error"
			end
		end
		finishDeliveryBatch(succeeded, failed)
	end, debug.traceback)

	deliveryWorkerRunning = false
	if not workerSuccess then
		warn("[Nekobuxx] Worker antrean pembelian gagal:", workerError)
	end
end

local function reportPurchase(player, itemId, itemType)
	if not configurationReady() or not player or not player:IsA("Player") then
		return
	end
	if isDuplicate(player, itemId, itemType) then
		return
	end

	local productInfo = getProductInfo(itemId, itemType)
	if not productInfo then
		return
	end

	local price = tonumber(productInfo.PriceInRobux or productInfo.Price)
	if not price or price < MIN_ITEM_PRICE then
		return
	end

	local payload = {
		eventId = string.format(
			"%s:%s:%d:%d:%s",
			SERVER_ID,
			itemType,
			player.UserId,
			itemId,
			HttpService:GenerateGUID(false)
		),
		robloxUserId = player.UserId,
		robloxUsername = player.Name,
		assetId = itemId,
		assetName = tostring(productInfo.Name or ("Item " .. itemId)),
		itemType = itemType,
		priceRobux = math.floor(price),
		purchasedAt = os.date("!%Y-%m-%dT%H:%M:%SZ"),
	}

	if enqueuePurchase(payload) then
		processDeliveryQueueOnce()
		return
	end

	local sent, sendError = sendToBot(payload)
	if not sent then
		warn(
			"[Nekobuxx] KRITIS: pembelian belum tersimpan di antrean dan gagal dikirim:",
			payload.eventId,
			sendError
		)
	end
end

MarketplaceService.PromptPurchaseFinished:Connect(function(player, assetId, wasPurchased)
	if wasPurchased then
		task.spawn(reportPurchase, player, assetId, "asset")
	end
end)

MarketplaceService.PromptBundlePurchaseFinished:Connect(function(player, bundleId, wasPurchased)
	if wasPurchased then
		task.spawn(reportPurchase, player, bundleId, "bundle")
	end
end)

task.spawn(function()
	while true do
		task.wait(DELIVERY_RETRY_INTERVAL_SECONDS)
		processDeliveryQueueOnce()
	end
end)

task.defer(processDeliveryQueueOnce)

print("[Nekobuxx] Purchase reporter + antrean persisten aktif.")
